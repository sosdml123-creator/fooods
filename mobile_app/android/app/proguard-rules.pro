# Proguard rules for Flutter release build optimization

# Keep Flutter engine classes and plugin wrapper classes
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.embedding.** { *; }
-keep class io.flutter.provider.** { *; }
-keep class io.flutter.plugins.** { *; }

# Allow obfuscation of the application code, while preserving required platform APIs
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# Keep custom native activity
-keep class com.foodhouse.plating_mobile_app.MainActivity { *; }
