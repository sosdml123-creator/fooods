package com.foodhouse.plating_mobile_app

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import android.content.Intent
import android.net.Uri
import java.net.URISyntaxException

class MainActivity: FlutterActivity() {
    private val CHANNEL = "com.foodhouse.plating/intent"

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
