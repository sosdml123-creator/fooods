import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'dart:convert';
import 'dart:io';
import 'dart:ui';
import 'custom_gallery_picker.dart';

// Firebase 패키지 추가
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:firebase_analytics/firebase_analytics.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Google Mobile Ads (AdMob) SDK 초기화
  try {
    await MobileAds.instance.initialize();
    debugPrint("[AdMob] Google Mobile Ads SDK initialized successfully.");
  } catch (adErr) {
    debugPrint("[AdMob Initialization Error] $adErr");
  }

  // Firebase 초기화 및 푸시 알림 설정
  try {
    await Firebase.initializeApp();
    
    // Firebase Analytics 인스턴스 활성화
    FirebaseAnalytics.instance.setAnalyticsCollectionEnabled(true);
    
    // FCM 권한 요청 (알림 수신용)
    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    
    // 푸시 토큰 로깅 (백엔드 FCM 전송 시 식별값으로 사용)
    String? fcmToken = await messaging.getToken();
    debugPrint("[Firebase FCM Token] $fcmToken");
    
    // 앱이 켜져 있을 때 (Foreground) 푸시 수신 시 리스너
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      debugPrint("[FCM Foreground Message] Title: ${message.notification?.title}, Body: ${message.notification?.body}");
    });
  } catch (e) {
    debugPrint("[Firebase Initialization Error] Firebase 초기화 실패 (심사 중 무중단 테스트 보장): $e");
  }

  // 프레임워크 렌더링 에러 가로채기 (Crash 방지)
  FlutterError.onError = (FlutterErrorDetails details) {
    FlutterError.presentError(details);
    debugPrint("[Flutter Error] ${details.exceptionAsString()}");
  };

  // 비동기 스레드 에러 가로채기 (Crash 방지)
  PlatformDispatcher.instance.onError = (Object error, StackTrace stack) {
    debugPrint("[Platform Error] Caught: $error");
    return true; // 에러가 처리됨으로 표시하여 앱 강제 종료(Crash)를 막음
  };

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '플레이팅',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: Colors.grey,
      ),
      home: const WebViewScreen(),
    );
  }
}

class WebViewScreen extends StatefulWidget {
  const WebViewScreen({super.key});

  @override
  State<WebViewScreen> createState() => _WebViewScreenState();
}

class _WebViewScreenState extends State<WebViewScreen> {
  InAppWebViewController? _webViewController;
  final String _targetUrl = 'https://myplating.kr';
  static const MethodChannel _intentChannel = MethodChannel('com.foodhouse.plating/intent');
  bool _isLoadingWeb = true;
  bool _hasError = false;

  // Google AdMob 관리 변수 ([수정 2], [수정 3], [수정 4] 반영)
  BannerAd? _bannerAd;
  bool _isBannerAdLoaded = false;

  // Google AdMob 상단/하단 배너 ID (실제 광고 ID 및 테스트 ID Fallback)
  String get _realBannerAdUnitId {
    if (Platform.isAndroid) {
      return 'ca-app-pub-3878859120989916/2421488045'; // 상단 배너 실제 ID
    }
    return 'ca-app-pub-3878859120989916/2421488045';
  }

  String get _testBannerAdUnitId {
    if (Platform.isAndroid) {
      return 'ca-app-pub-3940256099942544/6300978111'; // Android 테스트 배너 ID
    }
    return 'ca-app-pub-3940256099942544/6300978111';
  }

  void _loadBottomBannerAd({String position = 'top', int index = 0, bool useTestFallback = false}) {
    if (_bannerAd != null) return;
    
    final String adUnitIdToUse = useTestFallback ? _testBannerAdUnitId : _realBannerAdUnitId;

    _bannerAd = BannerAd(
      adUnitId: adUnitIdToUse,
      size: AdSize.banner,
      request: const AdRequest(),
      listener: BannerAdListener(
        onAdLoaded: (ad) {
          debugPrint('[AdMob Bridge] Banner ad loaded successfully ($adUnitIdToUse).');
          if (mounted) {
            setState(() {
              _isBannerAdLoaded = true;
            });
          }
        },
        onAdFailedToLoad: (ad, error) {
          debugPrint('[AdMob Bridge] Banner ad failed to load ($adUnitIdToUse): $error');
          ad.dispose();
          _bannerAd = null;
          if (mounted) {
            setState(() {
              _isBannerAdLoaded = false;
            });
            if (!useTestFallback) {
              // 실광고 실패 시 테스트 광고 단위로 즉시 Fallback 시도 (No Fill 차단)
              _loadBottomBannerAd(position: position, index: index, useTestFallback: true);
            } else {
              _webViewController?.evaluateJavascript(
                source: 'if(window.onAdLoadFailed) window.onAdLoadFailed("$position", $index);'
              );
            }
          }
        },
      ),
    )..load();
  }

  void _disposeBottomBannerAd() {
    if (_bannerAd != null) {
      _bannerAd!.dispose();
      _bannerAd = null;
      if (mounted) {
        setState(() {
          _isBannerAdLoaded = false;
        });
      }
    }
  }

  @override
  void dispose() {
    _disposeBottomBannerAd();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _requestPermissions();
    
    // 20초 타임아웃 폴백: 네트워크 지연 등으로 웹앱 준비 신호가 안 오면 로딩을 걷어냅니다.
    Future.delayed(const Duration(seconds: 20), () {
      if (mounted && _isLoadingWeb) {
        setState(() {
          _isLoadingWeb = false;
        });
      }
    });
  }

  Future<void> _requestPermissions() async {
    // 구글 플레이스토어 권한 최소화 권장안 준수: 
    // 미디어 및 카메라는 글쓰기 진입 시 컨텍스트별로 개별 요청하도록 하고, 
    // 앱 시작 시에는 알림(Push) 권한만 요청합니다.
    Map<Permission, PermissionStatus> statuses = await [
      Permission.notification,
    ].request();
    debugPrint("권한 요청 결과: $statuses");
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvoked: (didPop) async {
        if (didPop) return;
        final controller = _webViewController;
        if (controller != null && await controller.canGoBack()) {
          controller.goBack();
        } else {
          SystemNavigator.pop();
        }
      },
      child: Scaffold(
        backgroundColor: Colors.white,
        bottomNavigationBar: _isBannerAdLoaded && _bannerAd != null
            ? SafeArea(
                child: Container(
                  color: Colors.white,
                  height: _bannerAd!.size.height.toDouble(),
                  alignment: Alignment.center,
                  child: AdWidget(ad: _bannerAd!),
                ),
              )
            : null,
        body: SafeArea(
          child: Stack(
            children: [
              InAppWebView(
                initialUrlRequest: URLRequest(url: WebUri(_targetUrl)),
                initialSettings: InAppWebViewSettings(
                  useShouldOverrideUrlLoading: true,
                  mediaPlaybackRequiresUserGesture: false,
                  javaScriptEnabled: true,
                  javaScriptCanOpenWindowsAutomatically: true,
                  allowFileAccessFromFileURLs: true,
                  allowUniversalAccessFromFileURLs: true,
                  useOnDownloadStart: true,
                  cacheMode: CacheMode.LOAD_NO_CACHE,
                ),
            onWebViewCreated: (controller) {
              _webViewController = controller;
              
              // 갤러리 피커 통신용 JS 핸들러 등록
              controller.addJavaScriptHandler(
                handlerName: 'openCustomGallery',
                callback: (args) async {
                  final type = args.isNotEmpty ? (args[0]['type'] ?? 'recipe') : 'recipe';
                  
                  // 커스텀 갤러리 화면 호출 및 결과 대기 ( R2 이미지 URL 목록 리턴 받음 )
                  final List<dynamic>? urls = await Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => const CustomGalleryPicker(),
                    ),
                  );
                  
                  if (urls != null && urls.isNotEmpty && mounted && _webViewController != null) {
                    final urlsJson = jsonEncode(urls);
                    try {
                      if (type == 'community') {
                        await _webViewController!.evaluateJavascript(
                          source: 'window.openCommunityWriteWithPhotos($urlsJson);',
                        );
                      } else {
                        await _webViewController!.evaluateJavascript(
                          source: 'window.openWriteSheetWithPhotos($urlsJson);',
                        );
                      }
                      debugPrint('[UPLOAD STEP 8] WebView JavaScript URL delivery completed successfully.');
                    } catch (jsErr) {
                      debugPrint('[UPLOAD ERROR] JavaScript evaluation failed: $jsErr');
                    }
                  }
                  return urls;
                },
              );

              // 웹앱 로드 완료 통신용 JS 핸들러 등록
              controller.addJavaScriptHandler(
                handlerName: 'webAppReady',
                callback: (args) {
                  if (mounted && _isLoadingWeb) {
                    setState(() {
                      _isLoadingWeb = false;
                    });
                  }
                  return null;
                },
              );

              // 요구사항 3번: AdMob 광고 제어 JS 핸들러 (showAd / hideAd)
              controller.addJavaScriptHandler(
                handlerName: 'showAd',
                callback: (args) async {
                  debugPrint('[AdMob Bridge] showAd called with args: $args');
                  if (args.isNotEmpty && args[0] is Map) {
                    final Map<String, dynamic> data = Map<String, dynamic>.from(args[0]);
                    final String type = data['type'] ?? 'banner';
                    final String position = data['position'] ?? 'bottom';
                    final int index = data['index'] ?? 0;
                    
                    _loadBottomBannerAd(position: position, index: index);
                  } else {
                    _loadBottomBannerAd();
                  }
                  return {'success': true};
                },
              );

              controller.addJavaScriptHandler(
                handlerName: 'hideAd',
                callback: (args) async {
                  debugPrint('[AdMob Bridge] hideAd called');
                  _disposeBottomBannerAd();
                  return {'success': true};
                },
              );

              // 네이티브 광고 로딩용 JS 핸들러 등록
              controller.addJavaScriptHandler(
                handlerName: 'loadNativeAd',
                callback: (args) async {
                  try {
                    final adData = await _intentChannel.invokeMethod('loadNativeAd');
                    return adData;
                  } catch (e) {
                    debugPrint("AdMob Native Ad load error: $e");
                    return null;
                  }
                },
              );

              // 네이티브 광고 클릭 처리용 JS 핸들러 등록
              controller.addJavaScriptHandler(
                handlerName: 'performAdClick',
                callback: (args) async {
                  try {
                    final result = await _intentChannel.invokeMethod('performAdClick');
                    return result;
                  } catch (e) {
                    debugPrint("AdMob Native Ad click error: $e");
                    return false;
                  }
                },
              );

              // 디바이스 고유 ID 조회 JS 핸들러 등록
              controller.addJavaScriptHandler(
                handlerName: 'getDeviceId',
                callback: (args) async {
                  try {
                    final deviceId = await _intentChannel.invokeMethod('getDeviceId');
                    return deviceId;
                  } catch (e) {
                    debugPrint("getDeviceId error: $e");
                    return "unknown-device";
                  }
                },
              );

              // FCM 토큰 조회 JS 핸들러 등록
              controller.addJavaScriptHandler(
                handlerName: 'getFCMToken',
                callback: (args) async {
                  try {
                    String? token = await FirebaseMessaging.instance.getToken();
                    return token;
                  } catch (e) {
                    debugPrint("getFCMToken error: $e");
                    return null;
                  }
                },
              );

              // 세션 토큰 네이티브 영구 저장 JS 핸들러 등록
              controller.addJavaScriptHandler(
                handlerName: 'saveToken',
                callback: (args) async {
                  try {
                    final token = args.isNotEmpty ? (args[0]['token'] ?? '') : '';
                    final result = await _intentChannel.invokeMethod('saveToken', {'token': token});
                    return result;
                  } catch (e) {
                    debugPrint("saveToken error: $e");
                    return false;
                  }
                },
              );

              // 네이티브 영구 저장 세션 토큰 복원 JS 핸들러 등록
              controller.addJavaScriptHandler(
                handlerName: 'readToken',
                callback: (args) async {
                  try {
                    final token = await _intentChannel.invokeMethod('readToken');
                    return token;
                  } catch (e) {
                    debugPrint("readToken error: $e");
                    return null;
                  }
                },
              );
            },
            onPermissionRequest: (controller, request) async {
              // 웹뷰 내 카메라/마이크 등 권한 요청 시 자동 허용
              return PermissionResponse(
                resources: request.resources,
                action: PermissionResponseAction.GRANT,
              );
            },
            shouldOverrideUrlLoading: (controller, navigationAction) async {
              var uri = navigationAction.request.url;
              if (uri != null) {
                final urlStr = uri.toString();
                final scheme = uri.scheme;

                // 1. 커스텀 스키마 (navermaps://, coupang://, intent:// 등) 처리
                if (scheme != 'http' && scheme != 'https' && scheme != 'file' && scheme != 'about' && scheme != 'javascript') {
                  debugPrint('커스텀 스키마 감지: $urlStr');
                  try {
                    await _intentChannel.invokeMethod('launchIntent', {'url': urlStr});
                  } catch (e) {
                    debugPrint('인텐트 실행 실패: $e');
                  }
                  return NavigationActionPolicy.CANCEL;
                }

                // 2. HTTP/HTTPS 웹 링크 중 네이버 지도, 쿠팡, 플레이스토어는 외부 앱(딥링크)으로 다이렉트 호출
                final isNaverMap = urlStr.contains('map.naver.com') || urlStr.contains('naver.me');
                final isCoupang = urlStr.contains('coupang.com') || urlStr.contains('link.coupang.com');
                final isPlayStore = urlStr.contains('play.google.com/store');

                if (isNaverMap) {
                  debugPrint('네이버 지도 링크 감지: $urlStr');
                  _handleNaverMapIntent(urlStr);
                  return NavigationActionPolicy.CANCEL;
                }

                if (isCoupang || isPlayStore) {
                  debugPrint('외부 앱 연동 링크 감지: $urlStr');
                  try {
                    await _intentChannel.invokeMethod('launchIntent', {'url': urlStr});
                  } catch (e) {
                    debugPrint('인텐트 실행 실패: $e');
                  }
                  return NavigationActionPolicy.CANCEL;
                }
              }
              return NavigationActionPolicy.ALLOW;
            },
            onLoadStop: (controller, url) {
              // 더이상 onLoadStop 단계에서 로딩을 해제하지 않고,
              // 웹앱 내부의 React 마운트(webAppReady) 신호를 수신했을 때 해제합니다.
            },
            onReceivedError: (controller, request, error) {
              // 메인 프레임 로딩 오류 발생 시 에러 상태로 전환 (오프라인/타임아웃 대응)
              if (request.isForMainFrame ?? true) {
                setState(() {
                  _hasError = true;
                  _isLoadingWeb = false;
                });
              }
            },
          ),
          if (_isLoadingWeb)
            Container(
              color: Colors.white,
              width: double.infinity,
              height: double.infinity,
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(24),
                      child: Image.asset(
                        'assets/icon.png',
                        width: 120,
                        height: 120,
                        fit: BoxFit.cover,
                      ),
                    ),
                    const SizedBox(height: 20),
                    const Text(
                      "플레이팅",
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: Colors.black87,
                        letterSpacing: 1.0,
                      ),
                    ),
                    const SizedBox(height: 16),
                    const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        color: Colors.black54,
                        strokeWidth: 2.5,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          if (_hasError)
            Container(
              color: Colors.white,
              width: double.infinity,
              height: double.infinity,
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32.0),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(
                        Icons.wifi_off_rounded,
                        size: 64,
                        color: Colors.black54,
                      ),
                      const SizedBox(height: 24),
                      const Text(
                        "연결할 수 없습니다",
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: Colors.black87,
                        ),
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        "인터넷 연결 상태를 확인하거나 서버가 깨어날 때까지 잠시 후 다시 시도해 주세요.",
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.black45,
                          height: 1.5,
                        ),
                      ),
                      const SizedBox(height: 32),
                      ElevatedButton.icon(
                        onPressed: () {
                          setState(() {
                            _hasError = false;
                            _isLoadingWeb = true;
                          });
                          _webViewController?.reload();
                        },
                        icon: const Icon(Icons.refresh_rounded, color: Colors.white),
                        label: const Text(
                          "재시도",
                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.black87,
                          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    ),
  ),
);
  }

  Future<void> _handleNaverMapIntent(String urlStr) async {
    try {
      String resolvedUrl = urlStr;
      if (urlStr.contains('naver.me')) {
        final client = HttpClient();
        client.connectionTimeout = const Duration(seconds: 3);
        final request = await client.getUrl(Uri.parse(urlStr));
        request.followRedirects = false;
        final response = await request.close();
        final location = response.headers.value('location');
        if (location != null && location.isNotEmpty) {
          resolvedUrl = location;
        }
      }

      String intentUrl;
      final placeId = _extractNaverPlaceId(resolvedUrl);
      if (placeId != null) {
        intentUrl = 'intent://place?id=$placeId&appname=com.foodhouse.plating_mobile_app#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;end';
      } else {
        final query = _extractNaverSearchQuery(resolvedUrl);
        if (query != null) {
          intentUrl = 'intent://search?query=${Uri.encodeComponent(query)}&appname=com.foodhouse.plating_mobile_app#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;end';
        } else {
          intentUrl = 'intent://map?&appname=com.foodhouse.plating_mobile_app#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;end';
        }
      }

      debugPrint('네이버 지도 인텐트 실행: $intentUrl');
      await _intentChannel.invokeMethod('launchIntent', {'url': intentUrl});
    } catch (e) {
      debugPrint('네이버 지도 인텐트 실행 중 오류: $e');
      try {
        await _intentChannel.invokeMethod('launchIntent', {'url': urlStr});
      } catch (err) {
        debugPrint('기본 웹 URL 실행 실패: $err');
      }
    }
  }

  String? _extractNaverPlaceId(String url) {
    final regexes = [
      RegExp(r'/place/(\d+)'),
      RegExp(r'pinId=(\d+)'),
      RegExp(r'placeId=(\d+)'),
      RegExp(r'place\.naver\?id=(\d+)'),
    ];
    for (final regex in regexes) {
      final match = regex.firstMatch(url);
      if (match != null && match.groupCount >= 1) {
        return match.group(1);
      }
    }
    return null;
  }

  String? _extractNaverSearchQuery(String url) {
    final regexes = [
      RegExp(r'/search/([^/?#]+)'),
      RegExp(r'query=([^&]+)'),
    ];
    for (final regex in regexes) {
      final match = regex.firstMatch(url);
      if (match != null && match.groupCount >= 1) {
        try {
          return Uri.decodeComponent(match.group(1)!);
        } catch (e) {
          return match.group(1);
        }
      }
    }
    return null;
  }
}
