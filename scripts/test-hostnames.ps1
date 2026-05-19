$tok = az account get-access-token --resource "https://api.powerplatform.com" --query accessToken -o tsv
$headers = @{ Authorization = "Bearer $tok"; Accept = "application/json" }
$apiver = "2022-03-01-preview"
$hosts = @(
    "97a54ffe5fefe7ecbb954743917395.18.environment.api.powerplatform.com",
    "org1b0111ac.crm.dynamics.com",
    "97a54ffe-5fef-e7ec-bb95-474391739518.environment.api.powerplatform.com"
)
foreach ($h in $hosts) {
    $url = "https://$h/copilotstudio/dataverse-backed/authenticated/bots/cr86a_DigitalTwin/conversations?api-version=$apiver"
    Write-Host "`n--- $h ---"
    try {
        $r = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -ContentType "application/json" -UseBasicParsing -TimeoutSec 15
        Write-Host "OK $($r.StatusCode): $($r.Content.Substring(0,[Math]::Min(300,$r.Content.Length)))"
    }
    catch {
        $resp = $_.Exception.Response
        if ($resp) {
            try {
                $s = New-Object IO.StreamReader($resp.GetResponseStream())
                $body = $s.ReadToEnd()
            }
            catch { $body = "(unreadable)" }
            Write-Host "FAIL $([int]$resp.StatusCode): $body"
        }
        else { Write-Host "ERR: $($_.Exception.Message)" }
    }
}
