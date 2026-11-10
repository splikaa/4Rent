$ErrorActionPreference = "Continue"

$sdkDir = if ($env:ANDROID_HOME -and (Test-Path $env:ANDROID_HOME)) {
  $env:ANDROID_HOME
} elseif ($env:ANDROID_SDK_ROOT -and (Test-Path $env:ANDROID_SDK_ROOT)) {
  $env:ANDROID_SDK_ROOT
} elseif (Test-Path "$env:LOCALAPPDATA\Android\sdk") {
  "$env:LOCALAPPDATA\Android\sdk"
} else {
  "$env:LOCALAPPDATA\Android\sdk"
}
$java = "$sdkDir\jdk\bin\java.exe"
$javac = "$sdkDir\jdk\bin\javac.exe"
$keytool = "$sdkDir\jdk\bin\keytool.exe"
$buildTools = "$sdkDir\build-tools"
$aapt2 = "$buildTools\aapt2.exe"
$zipalign = "$buildTools\zipalign.exe"
$androidJar = "$sdkDir\platforms\android.jar"

$rootDir = (Resolve-Path "$PSScriptRoot\..").Path
$mobileDir = "$rootDir\mobile_app"
$srcDir = "$mobileDir\android_src"
$workDir = "$env:TEMP\4rent_apk_build"

Write-Host "Running Gradle task 'assembleRelease'..." -ForegroundColor Cyan

if (Test-Path $workDir) {
  Remove-Item $workDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path "$workDir\gen" | Out-Null
New-Item -ItemType Directory -Force -Path "$workDir\classes" | Out-Null
New-Item -ItemType Directory -Force -Path "$workDir\dex" | Out-Null
New-Item -ItemType Directory -Force -Path "$workDir\assets\www" | Out-Null
New-Item -ItemType Directory -Force -Path "$srcDir\res\mipmap-mdpi" | Out-Null
New-Item -ItemType Directory -Force -Path "$srcDir\res\mipmap-xxxhdpi" | Out-Null

# 1. Copy icons and compiled web bundle into assets/www
Copy-Item "$rootDir\public\icon-192.png" "$srcDir\res\mipmap-mdpi\ic_launcher.png" -Force
Copy-Item "$rootDir\public\icon-512.png" "$srcDir\res\mipmap-xxxhdpi\ic_launcher.png" -Force
if (Test-Path "$rootDir\dist") {
  Copy-Item "$rootDir\dist\*" "$workDir\assets\www\" -Recurse -Force
} else {
  Write-Warning "Directory '$rootDir\dist' does not exist. Run 'npm run build' first to package latest web assets."
}
Remove-Item "$workDir\assets\www\*.apk" -Force -ErrorAction SilentlyContinue

# 2. Compile resources with aapt2
if (-not (Test-Path $aapt2)) {
  Write-Warning "Android SDK build-tools (aapt2.exe) not found at: $aapt2"
  Write-Host "For a pure Node.js build without Android SDK, run: npm run build:apk" -ForegroundColor Yellow
  exit 1
}
& $aapt2 compile --dir "$srcDir\res" -o "$workDir\compiled_res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed" }

# 3. Link resources and AndroidManifest.xml into unaligned APK + R.java
& $aapt2 link -o "$workDir\unaligned.apk" `
  -I "$androidJar" `
  --manifest "$srcDir\AndroidManifest.xml" `
  --java "$workDir\gen" `
  "$workDir\compiled_res.zip" `
  --auto-add-overlay
if ($LASTEXITCODE -ne 0) { throw "aapt2 link failed" }

# 4. Compile Java sources (MainActivity.java + R.java) targeting bytecode 1.8 for D8
& $javac -source 1.8 -target 1.8 `
  -bootclasspath "$androidJar" `
  -classpath "$androidJar" `
  -d "$workDir\classes" `
  "$srcDir\java\com\splikaa\fourrent\MainActivity.java" `
  "$workDir\gen\com\splikaa\fourrent\R.java"
if ($LASTEXITCODE -ne 0) { throw "javac compilation failed" }

# 5. Convert compiled .class files into classes.dex using D8
$classFiles = Get-ChildItem -Path "$workDir\classes" -Recurse -Filter "*.class" | ForEach-Object { $_.FullName }
& $java -cp "$buildTools\lib\d8.jar" com.android.tools.r8.D8 `
  --release `
  --min-api 24 `
  --lib "$androidJar" `
  --output "$workDir\dex" `
  $classFiles
if ($LASTEXITCODE -ne 0) { throw "D8 dexing failed" }

# 6. Inject classes.dex AND POSIX forward-slash assets/www/* into unaligned.apk
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open("$workDir\unaligned.apk", [System.IO.Compression.ZipArchiveMode]::Update)
[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, "$workDir\dex\classes.dex", "classes.dex", [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null

$wwwRoot = (Get-Item "$workDir\assets\www").FullName
Get-ChildItem -Path $wwwRoot -Recurse -File | ForEach-Object {
  $rel = $_.FullName.Substring($wwwRoot.Length).TrimStart('\', '/').Replace('\', '/')
  $entryName = "assets/www/$rel"
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
}
$zip.Dispose()

# 7. Align APK on 4-byte boundaries using zipalign
& $zipalign -f -p 4 "$workDir\unaligned.apk" "$workDir\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

# 8. Create release signing keystore if not present
$keystorePath = "$mobileDir\4rent-release-key.jks"
if (-not (Test-Path $keystorePath)) {
  & $keytool -genkeypair `
    -keystore "$keystorePath" `
    -alias 4rent_release `
    -keyalg RSA `
    -keysize 2048 `
    -validity 10000 `
    -storepass 4rent2026 `
    -keypass 4rent2026 `
    -dname "CN=splikaa, OU=4Rent Management System, O=splikaa, L=Manila, S=NCR, C=PH" | Out-Null
}

# 9. Sign APK with V1 + V2 + V3 cryptographic signature using apksigner
$outDir = "$mobileDir\build\app\outputs\flutter-apk"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$finalApk = "$outDir\app-release.apk"

& $java -jar "$buildTools\lib\apksigner.jar" sign `
  --ks "$keystorePath" `
  --ks-key-alias 4rent_release `
  --ks-pass pass:4rent2026 `
  --key-pass pass:4rent2026 `
  --v1-signing-enabled true `
  --v2-signing-enabled true `
  --v3-signing-enabled true `
  --out "$finalApk" `
  "$workDir\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "apksigner failed" }

# 10. Copy to standardized distribution location packages\mobile\
$mobilePkgDir = "$rootDir\packages\mobile"
if (-not (Test-Path $mobilePkgDir)) {
  New-Item -ItemType Directory -Force -Path $mobilePkgDir | Out-Null
}
Copy-Item "$finalApk" "$mobilePkgDir\4Rent-v1.0.0-release.apk" -Force
if (Test-Path "$rootDir\dist") {
  Copy-Item "$finalApk" "$rootDir\dist\4Rent-v1.0.0-release.apk" -Force
}

$sizeMB = [math]::Round((Get-Item $finalApk).Length / 1MB, 2)
Write-Host "Built build\app\outputs\flutter-apk\app-release.apk ($sizeMB MB)." -ForegroundColor Green
Write-Host "Distributed to: $mobilePkgDir\4Rent-v1.0.0-release.apk" -ForegroundColor Green
