@echo off
rustup install 1.77.2 --profile minimal
if errorlevel 1 exit /b 1
rustup target add i686-pc-windows-msvc --toolchain 1.77.2
if errorlevel 1 exit /b 1
rustc +1.77.2 --version
