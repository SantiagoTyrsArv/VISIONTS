# Sintetizador de SeñaVoz: voces OneCore de Windows (WinRT) a WAV.
# Entrada por stdin (JSON UTF-8):
#   {"action":"voices"}
#   {"action":"synthesize","items":[{"text":"...","voiceId":"...|null","rate":1,"outPath":"C:\\...\\x.wav"}]}
# Salida por stdout (JSON): la lista de voces en español o un resultado por frase.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.Encoding]::UTF8
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

# PowerShell 5.1 no sabe esperar operaciones WinRT: se convierten a Task con AsTask.
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Await($operation, [Type]$resultType) {
  $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
  $task.Wait()
  $task.Result
}

$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$all = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices
$spanish = @($all | Where-Object { $_.Language -like 'es*' })

if ($request.action -eq 'voices') {
  $list = @($spanish | ForEach-Object { [pscustomobject]@{ id = $_.Id; name = $_.DisplayName; lang = $_.Language } })
  ConvertTo-Json -InputObject $list -Compress
  exit 0
}

# Voz por defecto: la del sistema si es española; si no, la primera española.
$systemDefault = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::DefaultVoice
$default = if ($systemDefault.Language -like 'es*') { $systemDefault } elseif ($spanish.Count -gt 0) { $spanish[0] } else { $systemDefault }

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$results = @(foreach ($item in $request.items) {
  try {
    $voice = $all | Where-Object { $_.Id -eq $item.voiceId } | Select-Object -First 1
    $synth.Voice = if ($voice) { $voice } else { $default }
    $synth.Options.SpeakingRate = [double]$item.rate
    $stream = Await ($synth.SynthesizeTextToStreamAsync([string]$item.text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
    $size = [uint32]$stream.Size
    $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
    $null = Await ($reader.LoadAsync($size)) ([uint32])
    $bytes = New-Object byte[] $size
    $reader.ReadBytes($bytes)
    [IO.File]::WriteAllBytes([string]$item.outPath, $bytes)
    [pscustomobject]@{ ok = $true }
  } catch {
    [pscustomobject]@{ ok = $false; error = $_.Exception.Message }
  }
})
ConvertTo-Json -InputObject $results -Compress
