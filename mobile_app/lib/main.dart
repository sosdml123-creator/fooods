import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:permission_handler/permission_handler.dart';
import 'dart:convert';
import 'dart:io';
import 'custom_gallery_picker.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
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

  @override
  void initState() {
    super.initState();
    _requestPermissions();
  }

  Future<void> _requestPermissions() async {
    // 앱 진입 시 알림 푸시, 카메라, 사진 보관함, 저장소 권한을 일괄 요청합니다.
    Map<Permission, PermissionStatus> statuses = await [
      Permission.notification,
      Permission.camera,
      Permission.photos,
      Permission.storage,
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
                  
                  if (urls != null && urls.isNotEmpty) {
                    final urlsJson = jsonEncode(urls);
                    if (type == 'community') {
                      controller.evaluateJavascript(
                        source: 'window.openCommunityWriteWithPhotos($urlsJson);',
                      );
                    } else {
                      controller.evaluateJavascript(
                        source: 'window.openWriteSheetWithPhotos($urlsJson);',
                      );
                    }
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
              setState(() {
                _isLoadingWeb = false;
              });
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
