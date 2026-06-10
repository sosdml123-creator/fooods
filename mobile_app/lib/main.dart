import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '플레이팅 모바일',
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
  late final WebViewController _controller;

  // 💡 구동 환경별 연결 주소 설정 변수
  // - 안드로이드 에뮬레이터 로컬 테스트: 'http://10.0.2.2:4000'
  // - iOS 시뮬레이터 로컬 테스트: 'http://localhost:4000'
  // - 실기기 로컬 테스트: 'http://컴퓨터IP주소:4000' (예: 'http://192.168.0.15:4000')
  // - 실서버 배포 테스트: 'https://내웹사이트.domain.com'
  final String _targetUrl = 'https://myplating.kr'; 

  @override
  void initState() {
    super.initState();
    
    // WebView 컨트롤러 초기화 및 카카오 로그인을 위한 설정
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted) // JavaScript 활성화 (카카오 로그인 필수)
      ..setBackgroundColor(Colors.white)
      ..setUserAgent("Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36") // Kakao OAuth User Agent 차단 방지용
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (int progress) {
            // 페이지 로딩 게이지
          },
          onPageStarted: (String url) {
            debugPrint('페이지 로딩 시작: $url');
          },
          onPageFinished: (String url) {
            debugPrint('페이지 로딩 완료: $url');
          },
          onWebResourceError: (WebResourceError error) {
            debugPrint('웹 뷰 리소스 로드 에러: ${error.description}');
          },
          onNavigationRequest: (NavigationRequest request) {
            final String url = request.url;
            debugPrint('리다이렉션 시도 주소: $url');

            // 카카오 로그인 스키마 등 딥링크 연동 처리
            if (url.startsWith('intent://') || 
                url.startsWith('kakaolink://') || 
                url.startsWith('kakaotalk://') || 
                url.startsWith('kakaotoll://')) {
              // 딥링크 스키마가 감지되면 인텐트 연동(예: 외부 브라우저 호출 또는 카카오톡 앱 직접 연동)을 위한 처리 구문
              // (실기기 빌드 시에는 url_launcher 패키지를 추가하여 launchUrl(Uri.parse(url)) 로 직접 호출해주면 카카오톡 앱이 열립니다.)
              debugPrint('카카오 인텐트 및 외부 스키마 감지: $url');
              return NavigationDecision.prevent; // 웹뷰 내부에서의 일반 페이지 탐색 차단
            }

            return NavigationDecision.navigate; // 일반 웹 주소는 정상 리다이렉션 허용
          },
        ),
      )
      ..loadRequest(Uri.parse(_targetUrl));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        // 상단 노치 및 하단 바 영역을 지키는 모바일 안전 구역 내 렌더링
        child: WebViewWidget(controller: _controller),
      ),
    );
  }
}
