package com.foodhouse.plating_mobile_app

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.AdLoader
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdListener
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.nativead.NativeAd
import java.net.URISyntaxException

class MainActivity: FlutterActivity() {
    private val CHANNEL = "com.foodhouse.plating/intent"
    private var nativeAd: NativeAd? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Enable Chrome remote web debugging
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.KITKAT) {
            android.webkit.WebView.setWebContentsDebuggingEnabled(true)
        }

        // Initialize the Google Mobile Ads SDK on a background thread.
        Thread {
            MobileAds.initialize(this) {}
        }.start()
    }

    override fun onDestroy() {
        nativeAd?.destroy()
        super.onDestroy()
    }

    private fun loadNativeAd(callback: (Map<String, String?>?) -> Unit) {
        Thread {
            try {
                val realAdUnit = "ca-app-pub-3878859120989916/9384771667"
                val testAdUnit = "ca-app-pub-3940256099942544/2247696110"
                
                loadAdInternal(realAdUnit) { adData ->
                    if (adData != null) {
                        callback(adData)
                    } else {
                        // Real ad failed (typically due to No Fill during testing), try test ad unit
                        android.util.Log.w("AdMob", "Real ad failed to load, trying test ad unit fallback...")
                        loadAdInternal(testAdUnit, callback)
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
                callback(null)
            }
        }.start()
    }

    private fun loadAdInternal(adUnitId: String, onResult: (Map<String, String?>?) -> Unit) {
        runOnUiThread {
            try {
                val adLoader = AdLoader.Builder(this, adUnitId)
                    .forNativeAd { ad ->
                        nativeAd?.destroy()
                        nativeAd = ad
                        
                        val adData = mapOf(
                            "headline" to ad.headline,
                            "body" to ad.body,
                            "callToAction" to ad.callToAction,
                            "advertiser" to ad.advertiser,
                            "imageUrl" to ad.images.firstOrNull()?.uri?.toString()
                        )
                        onResult(adData)
                    }
                    .withAdListener(object : AdListener() {
                        override fun onAdFailedToLoad(adError: LoadAdError) {
                            android.util.Log.e("AdMob", "Ad failed to load (unit: $adUnitId): ${adError.code} - ${adError.message}")
                            onResult(null)
                        }
                    })
                    .build()
                adLoader.loadAd(AdRequest.Builder().build())
            } catch (e: Exception) {
                e.printStackTrace()
                onResult(null)
            }
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
                loadNativeAd { adData ->
                    runOnUiThread {
                        result.success(adData)
                    }
                }
            } else if (call.method == "performAdClick") {
                runOnUiThread {
                    try {
                        nativeAd?.let { ad ->
                            // WebView에서 광고 클릭 시 네이티브 AdMob SDK에 클릭 이벤트를 강제로 전달
                            val fakeView = android.view.View(this@MainActivity)
                            val adView = com.google.android.gms.ads.nativead.NativeAdView(this@MainActivity)
                            adView.addView(fakeView)
                            adView.setNativeAd(ad)
                            adView.callToActionView = fakeView
                            fakeView.performClick()
                            result.success(true)
                        } ?: run {
                            result.success(false)
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                        result.error("CLICK_ERROR", e.message, null)
                    }
                }
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
            
            // Add flag to open in a new task
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            
            // Resolve activity
            val packageManager = context.packageManager
            if (intent.resolveActivity(packageManager) != null) {
                context.startActivity(intent)
                return true
            } else {
                // If package is specified, try to open Play Store fallback
                val pack = intent.`package`
                if (pack != null) {
                    val marketIntent = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$pack"))
                    marketIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    if (marketIntent.resolveActivity(packageManager) != null) {
                        context.startActivity(marketIntent)
                        return true
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return false
    }
}
