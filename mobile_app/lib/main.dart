import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'dart:async';

Future<void> main() async {
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
  bool _isLoading = true;
  bool _hasError = false;
  String _pageTitle = '';

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
                initialUrlRequest: URLRequest(
                  url: WebUri(_targetUrl),
                ),
                initialSettings: InAppWebViewSettings(
                  // Android WebView 최적화 설정
                  javaScriptEnabled: true,
                  domStorageEnabled: true,
                  databaseEnabled: true,
                  thirdPartyCookiesEnabled: true,
                  mixedContentMode: MixedContentMode.MIXED_CONTENT_ALWAYS_ALLOW,
                  allowFileAccessFromFileURLs: true,
                  allowUniversalAccessFromFileURLs: true,
                  allowContentAccess: true,
                  allowFileAccess: true,
                  isInspectable: true, // Chrome remote debugging (chrome://inspect/#devices)
                  useShouldOverrideUrlLoading: true,
                  mediaPlaybackRequiresUserGesture: false,
                  javaScriptCanOpenWindowsAutomatically: true,
                  supportZoom: false,
                  safeBrowsingEnabled: false,
                ),
                onWebViewCreated: (controller) {
                  _webViewController = controller;
                  debugPrint('[WebView Created] Controller initialized.');
                  
                  // 웹앱 준비 완료 시그널 핸들러
                  controller.addJavaScriptHandler(
                    handlerName: 'webAppReady',
                    callback: (args) {
                      debugPrint('[WebView JS Handler] webAppReady signal received.');
                      if (mounted && _isLoading) {
                        setState(() {
                          _isLoading = false;
                        });
                      }
                      return {'success': true};
                    },
                  );
                },
                onLoadStart: (controller, url) {
                  debugPrint('[WebView LoadStart] URL: ${url?.toString()}');
                  if (mounted && !_isLoading) {
                    setState(() {
                      _isLoading = true;
                      _hasError = false;
                    });
                  }
                },
                onLoadStop: (controller, url) async {
                  debugPrint('[WebView LoadStop] URL: ${url?.toString()}');
                  if (mounted) {
                    setState(() {
                      _isLoading = false;
                    });
                  }
                  final title = await controller.getTitle();
                  debugPrint('[WebView Title] Page Title: $title');
                  if (mounted) {
                    setState(() {
                      _pageTitle = title ?? '';
                    });
                  }
                },
                onTitleChanged: (controller, title) {
                  debugPrint('[WebView TitleChanged] Title: $title');
                },
                onConsoleMessage: (controller, consoleMessage) {
                  debugPrint('[WebView Console] [${consoleMessage.messageLevel}] ${consoleMessage.message} (${consoleMessage.source}:${consoleMessage.lineNumber})');
                },
                onReceivedError: (controller, request, error) {
                  debugPrint('[WebView ReceivedError] URL: ${request.url?.toString()}, ErrorCode: ${error.type}, Description: ${error.description}');
                  final urlStr = request.url?.toString() ?? '';
                  final isMainFrame = request.isForMainFrame ?? false;
                  
                  if (isMainFrame && (urlStr == _targetUrl || urlStr == "$_targetUrl/" || urlStr.startsWith(_targetUrl))) {
                    if (mounted) {
                      setState(() {
                        _hasError = true;
                        _isLoading = false;
                      });
                    }
                  }
                },
                onReceivedHttpError: (controller, request, errorResponse) {
                  debugPrint('[WebView HTTP Error] URL: ${request.url?.toString()}, Status: ${errorResponse.statusCode}, Reason: ${errorResponse.reasonPhrase}');
                },
                shouldOverrideUrlLoading: (controller, navigationAction) async {
                  final uri = navigationAction.request.url;
                  final urlStr = uri?.toString() ?? '';
                  debugPrint('[WebView Navigation] Request URL: $urlStr');
                  return NavigationActionPolicy.ALLOW;
                },
              ),
              if (_isLoading)
                Container(
                  color: Colors.white,
                  child: const Center(
                    child: CircularProgressIndicator(
                      color: Colors.black87,
                    ),
                  ),
                ),
              if (_hasError)
                Container(
                  color: Colors.white,
                  padding: const EdgeInsets.all(24.0),
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.wifi_off_rounded, size: 60, color: Colors.grey),
                        const SizedBox(height: 16),
                        const Text(
                          "페이지를 불러올 수 없습니다",
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          "네트워크 상태를 확인해 주세요.",
                          style: TextStyle(color: Colors.grey[600]),
                        ),
                        const SizedBox(height: 24),
                        ElevatedButton(
                          onPressed: () {
                            setState(() {
                              _hasError = false;
                              _isLoading = true;
                            });
                            _webViewController?.reload();
                          },
                          child: const Text("재시도"),
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
