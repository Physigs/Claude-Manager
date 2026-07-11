Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = "C:\workspaces\claude-launcher"
objShell.Run "cmd /c npm start", 0, False
