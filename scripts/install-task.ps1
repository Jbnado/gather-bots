<#
.SYNOPSIS
Registra o gather-bots como tarefa agendada do Windows, iniciando no logon.

.DESCRIPTION
Cria uma tarefa no seu usuário (não precisa de admin) que roda `pnpm start` em
janela oculta sempre que você entra no Windows, e reinicia se o processo cair.

Rode uma vez:
    powershell -ExecutionPolicy Bypass -File scripts\install-task.ps1

Para remover:
    Unregister-ScheduledTask -TaskName "gather-bots" -Confirm:$false

Para ver se está rodando:
    Get-ScheduledTask -TaskName "gather-bots" | Get-ScheduledTaskInfo
#>

$ErrorActionPreference = "Stop"

$taskName = "gather-bots"
$projectDir = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path (Join-Path $projectDir ".env"))) {
    throw "Nao encontrei .env em $projectDir. Copie .env.example e preencha antes de instalar."
}

$pnpm = (Get-Command pnpm -ErrorAction SilentlyContinue).Source
if ($null -eq $pnpm) { throw "pnpm nao esta no PATH." }

# -WindowStyle Hidden mantem o console fora do caminho; a saida vai para o log.
$logFile = Join-Path $projectDir "state\service.log"
$command = "Set-Location '$projectDir'; & '$pnpm' start *>> '$logFile'"

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command `"$command`""

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# RestartCount/RestartInterval cobrem queda de rede prolongada: o processo morre,
# o Windows sobe de novo, e o diff garante que voltar do zero nao reenvia tudo.
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0)

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "tarefa anterior removida"
}

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -Description "Alimenta os Smart Objects do Gather" | Out-Null

Write-Host "tarefa '$taskName' registrada — inicia no proximo logon"
Write-Host "para iniciar agora:  Start-ScheduledTask -TaskName $taskName"
Write-Host "log:                 $logFile"
