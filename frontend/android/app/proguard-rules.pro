# Flutter
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }
-dontwarn io.flutter.embedding.**

# Keep annotations
-keepattributes *Annotation*

# Gson / JSON serialization (if used by plugins)
-keepattributes Signature
-keep class com.google.gson.** { *; }

# OkHttp (used by some Flutter plugins)
-dontwarn okhttp3.**
-dontwarn okio.**

# Google Play Services
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# Play Core (Flutter split compat)
-dontwarn com.google.android.play.core.splitcompat.SplitCompatApplication
