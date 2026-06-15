import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:permission_handler/permission_handler.dart';
import 'dart:convert';
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
                // 카카오 로그인 스키마 등 외부 앱 리다이렉션 흐름 제어 및 인텐트 실행
                if (urlStr.startsWith('intent://') || 
                    urlStr.startsWith('kakaolink://') || 
                    urlStr.startsWith('kakaotalk://') || 
                    urlStr.startsWith('kakaotoll://')) {
                  debugPrint('외부 스키마 및 카카오 딥링크 감지: $urlStr');
                  try {
                    await _intentChannel.invokeMethod('launchIntent', {'url': urlStr});
                  } on PlatformException catch (e) {
                    debugPrint('카카오 인텐트 실행 실패: ${e.message}');
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
}
