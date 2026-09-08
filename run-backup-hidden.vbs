' Runs the RPT database backup silently (no window). Used by the weekly task.
Set fso = CreateObject("Scripting.FileSystemObject")
projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = projectDir

nodeExe = "node"
If fso.FileExists("C:\Program Files\nodejs\node.exe") Then
  nodeExe = "C:\Program Files\nodejs\node.exe"
ElseIf fso.FileExists("C:\nvm4w\nodejs\node.exe") Then
  nodeExe = "C:\nvm4w\nodejs\node.exe"
End If

sh.Run "cmd /c """ & nodeExe & """ """ & projectDir & "\backup-rpt.js""", 0, False
