import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:url_launcher/url_launcher.dart';
import 'dart:async';
import 'dart:io';

Future<void> main() async {
  WidgetsBinding widgetsBinding = WidgetsFlutterBinding.ensureInitialized();
  // 구글 애드몹 SDK 비동기 초기화
  unawaited(MobileAds.instance.initialize());
  // 앱 구동 시 플레이팅 네이티브 스플래시 로고 유지
  FlutterNativeSplash.preserve(widgetsBinding: widgetsBinding);
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
  bool _isLoadingWeb = true;
  bool _hasError = false;
  Timer? _safetyTimer;

  // 구글 애드몹 상단 1줄 배너 광고 설정 (발급받은 광고 단위 ID)
  static const String _adUnitId = 'ca-app-pub-3878859120989916/2421488045';
  BannerAd? _bannerAd;
  bool _isBannerAdLoaded = false;
  bool _isLoggedIn = false;
  bool _hideAdByPage = false; // 지도 탭 등 특정 페이지 광고 숨김 상태

  @override
  void initState() {
    super.initState();
    // 8초 후 무한 로딩 방지를 위한 강제 안전 해제 타이머
    _safetyTimer = Timer(const Duration(seconds: 8), () {
      _dismissLoading('[Safety Timer Expiry] Force removing splash & loading overlay.');
    });
  }

  @override
  void dispose() {
    _safetyTimer?.cancel();
    _disposeBannerAd();
    super.dispose();
  }

  void _loadBannerAd({bool isFallback = false}) {
    if (_bannerAd != null) return;

    // Platform 분기: Android와 iOS 구글 공식 애드몹 테스트 광고 단위 ID 분리
    final String fallbackTestAdUnitId = Platform.isAndroid
        ? 'ca-app-pub-3940256099942544/6300978111' // Android 공식 테스트 배너 ID
        : 'ca-app-pub-3940256099942544/2934735716'; // iOS 공식 테스트 배너 ID

    final targetUnitId = isFallback
        ? fallbackTestAdUnitId
        : _adUnitId; // 유저 발급 실시간 애드몹 광고 단위 ID

    debugPrint('[AdMob] Attempting to load banner ad on ${Platform.operatingSystem} with Unit ID: $targetUnitId (isFallback: $isFallback)');

    _bannerAd = BannerAd(
      adUnitId: targetUnitId,
      request: const AdRequest(),
      size: AdSize.banner, // 320x50 표준 1줄 배너 광고
      listener: BannerAdListener(
        onAdLoaded: (ad) {
          debugPrint('[AdMob] Top banner ad loaded successfully! ($targetUnitId)');
          if (mounted) {
            setState(() {
              _isBannerAdLoaded = true;
            });
          }
        },
        onAdFailedToLoad: (ad, err) {
          debugPrint('[AdMob] Top banner ad failed to load ($targetUnitId): $err');
          ad.dispose();
          _bannerAd = null;
          if (mounted) {
            setState(() {
              _isBannerAdLoaded = false;
            });
          }
          // 실시간 광고 단위 ID 노출 실패 시 테스트 전용 ID로 재시도하여 앱 테스트 시 광고 노출 보장
          if (!isFallback) {
            debugPrint('[AdMob] Retrying with Google Test Ad Unit ID for testing guarantee...');
            _loadBannerAd(isFallback: true);
          }
        },
      ),
    )..load();
  }

  void _disposeBannerAd() {
    _bannerAd?.dispose();
    _bannerAd = null;
    if (mounted) {
      setState(() {
        _isBannerAdLoaded = false;
      });
    }
  }

  void _updateLoginStatus(bool isLoggedIn) {
    debugPrint('[AdMob Status] Login status updated: $isLoggedIn (current loggedIn: $_isLoggedIn)');
    if (mounted) {
      setState(() {
        _isLoggedIn = isLoggedIn;
      });
    } else {
      _isLoggedIn = isLoggedIn;
    }

    if (isLoggedIn) {
      _loadBannerAd();
    } else {
      _disposeBannerAd();
    }
  }

  void _dismissLoading(String reason) {
    _safetyTimer?.cancel();
    try {
      FlutterNativeSplash.remove();
      debugPrint('[Splash] FlutterNativeSplash.remove() executed ($reason)');
    } catch (e) {
      debugPrint('[Splash Error] $e');
    }
    if (mounted && _isLoadingWeb) {
      setState(() {
        _isLoadingWeb = false;
      });
      debugPrint('[State Update] _isLoadingWeb set to false ($reason)');
    }
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
          // 플랫폼 분기: Android에서만 SystemNavigator.pop() 호출 (iOS에서는 앱 강제 종료 방지)
          if (Platform.isAndroid) {
            SystemNavigator.pop();
          }
        }
      },
      child: Scaffold(
        backgroundColor: Colors.white,
        body: SafeArea(
          child: Column(
            children: [
              // 로그인 시 및 지도 탭 등 광고 숨김 페이지가 아닐 때 최상단 1줄 구글 애드몹 배너 광고 노출
              if (_isLoggedIn && !_hideAdByPage && _bannerAd != null && _isBannerAdLoaded)
                Container(
                  color: Colors.white,
                  width: double.infinity,
                  height: _bannerAd!.size.height.toDouble(),
                  alignment: Alignment.center,
                  child: AdWidget(ad: _bannerAd!),
                ),
              Expanded(
                child: Stack(
                  children: [
                    InAppWebView(
                      initialUrlRequest: URLRequest(
                        url: WebUri(_targetUrl),
                      ),
                      initialSettings: InAppWebViewSettings(
                        javaScriptEnabled: true,
                        domStorageEnabled: true,
                        databaseEnabled: true,
                        supportZoom: false,
                        useShouldOverrideUrlLoading: true,
                        allowsInlineMediaPlayback: true, // iOS 동영상 인라인 재생 허용
                        allowsBackForwardNavigationGestures: Platform.isIOS, // iOS 스와이프 뒤로가기 제스처
                      ),
                      onWebViewCreated: (controller) {
                        _webViewController = controller;
                        debugPrint('[WebView] Initialized on ${Platform.operatingSystem}.');

                        // 웹앱 준비 완료 시그널 수신 핸들러 (선택 보조)
                        controller.addJavaScriptHandler(
                          handlerName: 'webAppReady',
                          callback: (args) {
                            debugPrint('[WebView JS Handler] webAppReady signal received.');
                            _dismissLoading('webAppReady JS handler received');
                            return {'success': true};
                          },
                        );

                        // 로그인 상태 연동 및 상단 애드몹 광고 토글 핸들러
                        controller.addJavaScriptHandler(
                          handlerName: 'onLoginStatusChanged',
                          callback: (args) {
                            final isLoggedIn = args.isNotEmpty && (args[0]['isLoggedIn'] == true || args[0]['isLoggedIn'] == 'true');
                            debugPrint('[WebView JS Handler] onLoginStatusChanged signal received: $isLoggedIn');
                            _updateLoginStatus(isLoggedIn);
                            return {'success': true};
                          },
                        );

                        // 페이지별 광고 표시/숨김 제어 핸들러
                        controller.addJavaScriptHandler(
                          handlerName: 'showAd',
                          callback: (args) {
                            debugPrint('[WebView JS Handler] showAd signal received.');
                            if (mounted) {
                              setState(() {
                                _hideAdByPage = false;
                              });
                            } else {
                              _hideAdByPage = false;
                            }
                            if (_isLoggedIn) {
                              _loadBannerAd();
                            }
                            return {'success': true};
                          },
                        );

                        controller.addJavaScriptHandler(
                          handlerName: 'hideAd',
                          callback: (args) {
                            debugPrint('[WebView JS Handler] hideAd signal received.');
                            if (mounted) {
                              setState(() {
                                _hideAdByPage = true;
                              });
                            } else {
                              _hideAdByPage = true;
                            }
                            return {'success': true};
                          },
                        );
                      },
                      onLoadStart: (controller, url) {
                        debugPrint('[WebView LoadStart] URL: ${url?.toString()}, current _isLoadingWeb: $_isLoadingWeb');
                      },
                      onLoadStop: (controller, url) async {
                        debugPrint('[WebView LoadStop] URL: ${url?.toString()}, current _isLoadingWeb: $_isLoadingWeb');
                        _dismissLoading('onLoadStop triggered for ${url?.toString()}');
                      },
                      onTitleChanged: (controller, title) {
                        debugPrint('[WebView TitleChanged] Page Title: $title');
                      },
                      onConsoleMessage: (controller, consoleMessage) {
                        debugPrint('[WebView Console] [${consoleMessage.messageLevel}] ${consoleMessage.message}');
                      },
                      onReceivedError: (controller, request, error) {
                        debugPrint('[WebView ReceivedError] URL: ${request.url.toString()}, ErrorCode: ${error.type}, Description: ${error.description}');
                        final urlStr = request.url.toString();
                        final isMainFrame = request.isForMainFrame ?? false;

                        if (isMainFrame && (urlStr == _targetUrl || urlStr == "$_targetUrl/" || urlStr.startsWith(_targetUrl))) {
                          if (mounted) {
                            setState(() {
                              _hasError = true;
                              _isLoadingWeb = false;
                            });
                            FlutterNativeSplash.remove();
                          }
                        }
                      },
                      onReceivedHttpError: (controller, request, errorResponse) {
                        debugPrint('[WebView HTTP Error] URL: ${request.url.toString()}, Status: ${errorResponse.statusCode}, Reason: ${errorResponse.reasonPhrase}');
                      },
                      shouldOverrideUrlLoading: (controller, navigationAction) async {
                        final uri = navigationAction.request.url;
                        final urlStr = uri?.toString() ?? '';
                        debugPrint('[WebView Navigation] Request URL: $urlStr');

                        if (uri != null) {
                          final scheme = uri.scheme.toLowerCase();
                          final host = uri.host.toLowerCase();

                          // 1. 커스텀 스킴(nmap, coupang 등) 및 intent:// URL 감지
                          final isCustomScheme = !['http', 'https', 'file', 'chrome', 'data', 'about'].contains(scheme) || urlStr.startsWith('intent:');

                          // 2. 외부 웹 도메인(myplating.kr 이외의 네이버지도/쿠팡 등 외부 링크) 감지
                          final isExternalWebLink = (scheme == 'http' || scheme == 'https') &&
                              host.isNotEmpty &&
                              !host.endsWith('myplating.kr') &&
                              host != 'localhost' &&
                              host != '127.0.0.1';

                          if (isCustomScheme || isExternalWebLink) {
                            debugPrint('[External Link / Intent Intercepted] Scheme: $scheme, Host: $host, URL: $urlStr');

                            if (Platform.isAndroid) {
                              try {
                                const platform = MethodChannel('com.foodhouse.plating/intent');
                                await platform.invokeMethod('launchIntent', {'url': urlStr});
                              } catch (e) {
                                debugPrint('[Android MethodChannel Error] $e');
                                try {
                                  if (await canLaunchUrl(uri)) {
                                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                                  }
                                } catch (err) {
                                  debugPrint('[url_launcher Fallback Error] $err');
                                }
                              }
                            } else if (Platform.isIOS) {
                              try {
                                if (await canLaunchUrl(uri)) {
                                  await launchUrl(uri, mode: LaunchMode.externalApplication);
                                } else {
                                  debugPrint('[iOS Scheme Error] Cannot launch url: $urlStr');
                                }
                              } catch (e) {
                                debugPrint('[iOS Scheme Error] $e');
                              }
                            }

                            // 외부 앱/브라우저로 이동시키므로 웹뷰 내부 Navigation은 취소
                            return NavigationActionPolicy.CANCEL;
                          }
                        }

                        return NavigationActionPolicy.ALLOW;
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
                                  width: 100,
                                  height: 100,
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
                                width: 24,
                                height: 24,
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
                                  "인터넷 연결 상태를 확인하고 잠시 후 다시 시도해 주세요.",
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
                                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
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
            ],
          ),
        ),
      ),
    );
  }
}
