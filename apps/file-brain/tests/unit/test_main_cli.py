import sys
from unittest.mock import MagicMock, patch

from file_brain import main


def test_build_desktop_server_command_uses_current_python():
    command = main.build_desktop_server_command(8274)

    assert command == [
        sys.executable,
        "-m",
        "uvicorn",
        "file_brain.main:app",
        "--host",
        main.settings.host,
        "--port",
        "8274",
        "--log-level",
        "info",
    ]


@patch("file_brain.lib.flaskwebgui.close_application")
@patch("file_brain.lib.flaskwebgui.FlaskUI")
@patch("file_brain.main.threading.Thread")
@patch("file_brain.main.subprocess.Popen")
def test_run_macos_desktop_app_uses_subprocess_backend(
    mock_popen,
    mock_thread,
    mock_flask_ui,
    mock_close_application,
):
    server_process = MagicMock()
    server_process.wait.return_value = 0
    server_process.poll.return_value = 0
    mock_popen.return_value = server_process

    browser_thread = MagicMock()
    browser_thread.is_alive.return_value = False
    mock_thread.return_value = browser_thread

    ui_instance = MagicMock()
    mock_flask_ui.return_value = ui_instance

    main._run_macos_desktop_app(8274)

    args, kwargs = mock_popen.call_args
    assert args[0] == main.build_desktop_server_command(8274)
    assert kwargs["env"]["OBJC_DISABLE_INITIALIZE_FORK_SAFETY"] == "YES"
    assert kwargs["stdout"] is sys.stdout
    assert kwargs["stderr"] is sys.stderr

    mock_flask_ui.assert_called_once_with(
        app=main.app,
        server="fastapi",
        port=8274,
        width=1200,
        height=800,
        on_shutdown=None,
    )

    _, thread_kwargs = mock_thread.call_args
    assert thread_kwargs["target"] == ui_instance.start_browser
    assert thread_kwargs["args"] == (server_process,)
    assert thread_kwargs["name"] == "desktop_browser"

    browser_thread.start.assert_called_once()
    browser_thread.join.assert_called_once()
    mock_close_application.assert_not_called()


@patch("file_brain.main._run_macos_desktop_app")
def test_run_production_desktop_app_uses_macos_launcher_on_darwin(mock_macos_launcher):
    with patch.object(main.sys, "platform", "darwin"):
        main.run_production_desktop_app(8274)

    mock_macos_launcher.assert_called_once_with(8274)


@patch("file_brain.lib.flaskwebgui.FlaskUI")
def test_run_production_desktop_app_uses_flaskwebgui_off_macos(mock_flask_ui):
    ui_instance = MagicMock()
    mock_flask_ui.return_value = ui_instance

    with patch.object(main.sys, "platform", "linux"):
        main.run_production_desktop_app(8274)

    mock_flask_ui.assert_called_once_with(
        app=main.app,
        server="fastapi",
        port=8274,
        width=1200,
        height=800,
        on_shutdown=main.on_shutdown_sync,
    )
    ui_instance.run.assert_called_once()
