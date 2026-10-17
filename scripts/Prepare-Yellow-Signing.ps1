param([switch]$CopyForGitHub)
$ErrorActionPreference = 'Stop'
$SigningDir = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'BANKSAWAN-YELLOW-SIGNING'
$Store = Join-Path $SigningDir 'yellow-permanent.p12'
$Certificate = Join-Path $SigningDir 'yellow-permanent.cer'
if ($CopyForGitHub) {
    if (-not (Test-Path -LiteralPath $Store -PathType Leaf)) { throw 'Keystore belum dibuat. Jalankan script tanpa -CopyForGitHub dahulu.' }
    Set-Clipboard -Value ([Convert]::ToBase64String([IO.File]::ReadAllBytes($Store)))
    Write-Host 'Keystore terenkripsi sudah disalin ke clipboard untuk GitHub Secret YELLOW_SIGNING_KEYSTORE_B64.'
    Write-Host 'Tempel hanya pada halaman GitHub Secret. Jangan kirim clipboard ini ke chat.'
    exit 0
}
if (Test-Path -LiteralPath $Store) { throw "Keystore sudah ada; tidak ditimpa: $Store" }
$Keytool = (Get-Command keytool.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $Keytool) {
    $Candidates = @()
    if ($env:JAVA_HOME) { $Candidates += Join-Path $env:JAVA_HOME 'bin\keytool.exe' }
    $Candidates += Get-ChildItem 'C:\Program Files\Eclipse Adoptium\jdk*\bin\keytool.exe','C:\Program Files\Java\jdk*\bin\keytool.exe','C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe' -ErrorAction SilentlyContinue | ForEach-Object FullName
    $Keytool = $Candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
}
if (-not $Keytool) { throw 'keytool belum ditemukan. Beri tahu saya; jangan buat keystore dengan alat lain dahulu.' }
New-Item -ItemType Directory -Path $SigningDir -Force | Out-Null
Write-Host 'Membuat signer permanen khusus YELLOW. Tidak mengubah BR atau APK di HP.'
Write-Host 'Masukkan password kuat saat diminta keytool. Simpan password dalam password manager.'
Write-Host 'Password yang diketik tidak terlihat. Jangan kirim password ke chat.'
& $Keytool -genkeypair -keystore $Store -storetype PKCS12 -alias yellow-permanent -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=BANKSAWAN YELLOW,O=BANKSAWAN,C=ID'
if ($LASTEXITCODE -ne 0) { throw 'Pembuatan keystore gagal. Tidak dilanjutkan.' }
Write-Host 'Masukkan password yang sama sekali lagi untuk mengekspor sertifikat publik.'
& $Keytool -exportcert -keystore $Store -storetype PKCS12 -alias yellow-permanent -file $Certificate
if ($LASTEXITCODE -ne 0) { throw 'Ekspor sertifikat gagal. Keystore tetap disimpan; jangan menghapus atau membuat ulang.' }
$Fingerprint = (Get-FileHash -LiteralPath $Certificate -Algorithm SHA256).Hash.ToUpperInvariant()
Set-Content -LiteralPath (Join-Path $SigningDir 'certificate-sha256.txt') -Value $Fingerprint -Encoding ASCII
Write-Host ''
Write-Host 'YELLOW SIGNER PERMANEN SIAP'
Write-Host "Folder: $SigningDir"
Write-Host "Certificate SHA256: $Fingerprint"
Write-Host 'Cadangkan yellow-permanent.p12 ke penyimpanan pribadi terenkripsi. Password disimpan terpisah.'
Write-Host 'Kirim hanya screenshot hasil publik ini. Jangan unggah .p12 atau password.'
