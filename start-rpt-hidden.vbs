' Launches the RPT server with NO visible window (used by the auto-start task).
Set fso = CreateObject("Scripting.FileSystemObject")
projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = projectDir
sh.Run "cmd /c """ & projectDir & "\run-server-LOCAL.bat""", 0, False
