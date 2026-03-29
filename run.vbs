Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "C:\dev\apps\explorer"
shell.Run "cmd /c .venv\Scripts\activate && python main.py", 0, False
