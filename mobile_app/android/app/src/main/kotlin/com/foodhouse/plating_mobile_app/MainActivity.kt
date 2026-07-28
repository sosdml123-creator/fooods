package com.foodhouse.plating_mobile_app

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.core.view.WindowCompat
import java.net.URISyntaxException

class MainActivity: FlutterActivity() {
    private val CHANNEL = "com.foodhouse.plating/intent"

    override fun onCreate(savedInstanceState: Bundle?) {
        // Android 16 edge-to-edge 강제 적용 대응:
        // setDecorFitsSystemWindows(true) 로 기존 동작 유지(콘텐츠가 상태바/제스처 영역에 가려지지 않음)
        WindowCompat.setDecorFitsSystemWindows(window, true)
        super.onCreate(savedInstanceState)
        
        // Enable Chrome remote web debugging
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.KITKAT) {
            android.webkit.WebView.setWebContentsDebuggingEnabled(true)
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            if (call.method == "launchIntent") {
                val url = call.argument<String>("url")
                if (url != null) {
                    val success = launchAndroidIntent(url)
                    result.success(success)
                } else {
                    result.error("BAD_ARGS", "URL is null", null)
                }
            } else if (call.method == "loadNativeAd") {
                // AdMob 제거 완료: 빈 데이터 응답
                result.success(null)
            } else if (call.method == "performAdClick") {
                // AdMob 제거 완료: 실패 응답
                result.success(false)
            } else if (call.method == "getDeviceId") {
                runOnUiThread {
                    try {
                        val androidId = android.provider.Settings.Secure.getString(contentResolver, android.provider.Settings.Secure.ANDROID_ID)
                        result.success(androidId)
                    } catch (e: Exception) {
                        e.printStackTrace()
                        result.success("unknown-android-device")
                    }
                }
            } else if (call.method == "saveToken") {
                runOnUiThread {
                    try {
                        val token = call.argument<String>("token")
                        val sharedPref = getSharedPreferences("plating_prefs", android.content.Context.MODE_PRIVATE)
                        with (sharedPref.edit()) {
                            putString("auth_token", token)
                            apply()
                        }
                        result.success(true)
                    } catch (e: Exception) {
                        e.printStackTrace()
                        result.success(false)
                    }
                }
            } else if (call.method == "readToken") {
                runOnUiThread {
                    try {
                        val sharedPref = getSharedPreferences("plating_prefs", android.content.Context.MODE_PRIVATE)
                        val token = sharedPref.getString("auth_token", null)
                        result.success(token)
                    } catch (e: Exception) {
                        e.printStackTrace()
                        result.success(null)
                    }
                }
            } else {
                result.notImplemented()
            }
        }
    }

    private fun launchAndroidIntent(url: String): Boolean {
        try {
            val intent = if (url.startsWith("intent:")) {
                Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
            } else {
                Intent(Intent.ACTION_VIEW, Uri.parse(url))
            }
            
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

            // 1. 앱이 설치되어 있는 경우 해당 앱 실행시도 (Android 11+ Package Visibility 제약 없이 직접 startActivity 실행)
            try {
                context.startActivity(intent)
                return true
            } catch (e: Exception) {
                android.util.Log.w("MainActivity", "Direct startActivity failed for $url: ${e.message}")
            }

            // 2. 앱 미설치 시: intent에 S.browser_fallback_url이 있으면 해당 모바일 웹 URL 실행
            val fallbackUrl = intent.getStringExtra("browser_fallback_url")
            if (!fallbackUrl.isNullOrEmpty()) {
                try {
                    val fallbackIntent = Intent(Intent.ACTION_VIEW, Uri.parse(fallbackUrl))
                    fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(fallbackIntent)
                    return true
                } catch (e: Exception) {
                    android.util.Log.w("MainActivity", "Fallback URL startActivity failed: ${e.message}")
                }
            }

            // 3. 앱 미설치 시: package명이 지정되어 있으면 플레이스토어 페이지로 이동
            val pack = intent.`package`
            if (!pack.isNullOrEmpty()) {
                try {
                    val marketIntent = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$pack"))
                    marketIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(marketIntent)
                    return true
                } catch (e: Exception) {
                    try {
                        val webMarketIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$pack"))
                        webMarketIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        context.startActivity(webMarketIntent)
                        return true
                    } catch (e2: Exception) {
                        e2.printStackTrace()
                    }
                }
            }

            // 4. 커스텀 스킴(nmap, coupang 등) 미설치 시 패키지 매핑 fallback
            val scheme = intent.scheme
            val fallbackPackage = when (scheme) {
                "nmap" -> "com.nhn.android.nmap"
                "naversearchapp" -> "com.nhn.android.search"
                "coupang" -> "com.coupang.mobile"
                "kakaotalk", "kakaolink" -> "com.kakao.talk"
                "toss", "supertoss" -> "viva.republica.toss"
                else -> null
            }
            if (fallbackPackage != null) {
                try {
                    val marketIntent = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$fallbackPackage"))
                    marketIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(marketIntent)
                    return true
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return false
    }
}
