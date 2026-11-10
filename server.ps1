# Tiny local web server (needs only Windows PowerShell - nothing to install)
$port = 8080
$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try { $listener.Start() } catch { Write-Host "Could not start on port $port. Close other programs using it and try again."; Read-Host "Press Enter"; exit }
Write-Host "Island Explorer 3D is running at http://localhost:$port/"
Write-Host "Keep this window open while playing. Close it to stop the game server."
Start-Process "http://localhost:$port/"
$mime = @{ '.html'='text/html'; '.js'='text/javascript'; '.css'='text/css'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.fbx'='application/octet-stream'; '.json'='application/json'; '.mp3'='audio/mpeg'; '.ogg'='audio/ogg'; '.wav'='audio/wav' }
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($path -eq '/') { $path = '/index.html' }
    $file = Join-Path $root ($path.TrimStart('/').Replace('/', '\'))
    if ((Test-Path $file -PathType Leaf) -and ($file.StartsWith($root))) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLower()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] } else { $ctx.Response.ContentType = 'application/octet-stream' }
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $ctx.Response.StatusCode = 404 }
  } catch { }
  try { $ctx.Response.OutputStream.Close() } catch { }
}
