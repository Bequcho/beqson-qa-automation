param([Parameter(Mandatory=$true)][string]$EvidencePath)
$ErrorActionPreference = 'Stop'
$qaRoot = [System.IO.Path]::GetFullPath($EvidencePath)
if (-not (Test-Path -LiteralPath $qaRoot -PathType Container)) { throw 'Evidence directory is missing.' }
if ($qaRoot.TrimEnd('\') -eq [System.IO.Path]::GetPathRoot($qaRoot).TrimEnd('\') -or $qaRoot -eq [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))) { throw 'Refusing to change permissions on a drive or workspace root.' }
if (((Get-Item -LiteralPath $qaRoot).Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Evidence directory cannot be a junction or symbolic link.' }
$qaIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$qaSystem = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18')
$qaAdmins = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
$qaEntries = @((Get-Item -LiteralPath $qaRoot)) + @(Get-ChildItem -LiteralPath $qaRoot -Force -Recurse)
foreach ($qaEntry in $qaEntries) {
  if (($qaEntry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Evidence must not contain junctions or symbolic links.' }
  if ($qaEntry.PSIsContainer) {
    $qaAcl = [System.Security.AccessControl.DirectorySecurity]::new()
    $qaAcl.SetAccessRuleProtection($true,$false)
    foreach ($qaPrincipal in @($qaIdentity,$qaSystem,$qaAdmins)) {
      $qaAcl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($qaPrincipal,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
    }
    if ($PSVersionTable.PSVersion.Major -ge 6) { [System.IO.FileSystemAclExtensions]::SetAccessControl([System.IO.DirectoryInfo]::new($qaEntry.FullName),$qaAcl) }
    else { [System.IO.DirectoryInfo]::new($qaEntry.FullName).SetAccessControl($qaAcl) }
  } else {
    $qaAcl = [System.Security.AccessControl.FileSecurity]::new()
    $qaAcl.SetAccessRuleProtection($true,$false)
    foreach ($qaPrincipal in @($qaIdentity,$qaSystem,$qaAdmins)) {
      $qaAcl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($qaPrincipal,'FullControl','Allow'))
    }
    if ($PSVersionTable.PSVersion.Major -ge 6) { [System.IO.FileSystemAclExtensions]::SetAccessControl([System.IO.FileInfo]::new($qaEntry.FullName),$qaAcl) }
    else { [System.IO.FileInfo]::new($qaEntry.FullName).SetAccessControl($qaAcl) }
  }
  $qaActual = Get-Acl -LiteralPath $qaEntry.FullName
  if (-not ($qaActual.Access | Where-Object { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -eq $qaIdentity.Value -and $_.AccessControlType -eq 'Allow' })) { throw 'Private ACL verification failed.' }
}
Write-Output 'Verified private local evidence permissions.'
