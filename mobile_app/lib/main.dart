import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:permission_handler/permission_handler.dart';
import 'dart:convert';
import 'dart:io';
import 'dart:ui';
import 'dart:async'; // readyTimer용 추가
import 'custom_gallery_picker.dart';

// Firebase 패키지 추가
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:firebase_analytics/firebase_analytics.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

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
  bool _isLoadingWeb = false; // 앱 켜지자마자 흰 가림막 없이 즉시 웹뷰 렌더링 시작하도록 false 설정
  bool _hasError = false;
  Timer? _readyTimer; // webAppReady용 타이머

  @override
  void dispose() {
    _readyTimer?.cancel(); // 타이머 해제
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _requestPermissions();
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
                  cacheMode: CacheMode.LOAD_DEFAULT,
                  // Android WebView ES Module 지원 강제 활성화
                  mixedContentMode: MixedContentMode.MIXED_CONTENT_ALWAYS_ALLOW,
                  domStorageEnabled: true,
                  databaseEnabled: true,
                  safeBrowsingEnabled: false,
                  supportZoom: false,
                  userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
                  // 4. 서드파티 쿠키 허용
                  thirdPartyCookiesEnabled: true,
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
                  try {
                    _readyTimer?.cancel(); // webAppReady 정상 수신 시 타이머 취소
                    if (mounted && _isLoadingWeb) {
                      setState(() {
                        _isLoadingWeb = false;
                      });
                    }
                  } catch (e) {
                    debugPrint('[webAppReady Error] $e');
                  }
                  return {'success': true};
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
            onConsoleMessage: (controller, consoleMessage) {
              debugPrint('[WebView Console] Level: ${consoleMessage.messageLevel}, Message: ${consoleMessage.message}');
            },
            onLoadStart: (controller, url) {
              debugPrint('[WebView LoadStart] URL: ${url?.toString()}');
            },
            onLoadStop: (controller, url) {
              debugPrint('[WebView LoadStop] URL: ${url?.toString()}');
            },
            onReceivedHttpError: (controller, request, errorResponse) {
              debugPrint('[WebView HTTP Error] URL: ${request.url?.toString()}, StatusCode: ${errorResponse.statusCode}, ReasonPhrase: ${errorResponse.reasonPhrase}');
            },
            shouldOverrideUrlLoading: (controller, navigationAction) async {
              var uri = navigationAction.request.url;
              final urlStr = uri?.toString() ?? '';
              debugPrint('[WebView OverrideUrlLoading] URL: $urlStr');
              
              if (uri != null) {
                final scheme = uri.scheme;

                // 1. 커스텀 스키마 (navermaps://, coupang://, intent:// 등) 처리
                if (scheme != 'http' && scheme != 'https' && scheme != 'file' && scheme != 'about' && scheme != 'javascript') {
                  debugPrint('[WebView Navigation] Custom Scheme Cancelled: $urlStr');
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
                  debugPrint('[WebView Navigation] NaverMap Intent Cancelled: $urlStr');
                  _handleNaverMapIntent(urlStr);
                  return NavigationActionPolicy.CANCEL;
                }

                if (isCoupang || isPlayStore) {
                  debugPrint('[WebView Navigation] External App Intent Cancelled: $urlStr');
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
            onReceivedError: (controller, request, error) {
              final urlStr = request.url?.toString() ?? '';
              final isMainFrame = request.isForMainFrame ?? false;
              debugPrint('[WebView Received Error] URL: $urlStr, ErrorType: ${error.type}, Description: ${error.description}, isMainFrame: $isMainFrame');
              
              // 오직 메인 웹페이지 HTML 본문(https://myplating.kr/)의 물리적 로딩 실패일 때만 오프라인 에러 화면으로 전환
              if (isMainFrame && (urlStr == _targetUrl || urlStr == "$_targetUrl/" || urlStr.startsWith(_targetUrl))) {
                final errTypeStr = error.type.toString();
                if (errTypeStr.contains('HOST_LOOKUP') || 
                    errTypeStr.contains('CONNECT') || 
                    errTypeStr.contains('TIMEOUT') ||
                    errTypeStr.contains('DISCONNECTED') ||
                    errTypeStr.contains('INTERNET_DISCONNECTED')) {
                  if (mounted) {
                    setState(() {
                      _hasError = true;
                      _isLoadingWeb = false;
                    });
                  }
                }
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
