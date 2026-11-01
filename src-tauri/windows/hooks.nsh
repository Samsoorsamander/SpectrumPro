; Install VC++ Redistributable (x86) so Windows 7 gets Universal CRT
; (api-ms-win-crt-*.dll). Runs after app files are copied.

!macro NSIS_HOOK_PREINSTALL
  ; Ask whether to wipe previous app data when reinstalling over an existing DB.
  SetShellVarContext current
  ${If} ${FileExists} "$APPDATA\com.spectrumpro.management.system\spectrum_pro.db"
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "Existing Spectrum Pro data was found on this PC.$\r$\n$\r$\nDo you want to DELETE the previous database and settings?$\r$\n$\r$\nYes = delete all old data (fresh start)$\r$\nNo = keep your existing data" \
      IDYES preinstall_wipe IDNO preinstall_keep
    preinstall_wipe:
      DetailPrint "Removing previous Spectrum Pro application data..."
      RmDir /r "$APPDATA\com.spectrumpro.management.system"
      RmDir /r "$LOCALAPPDATA\com.spectrumpro.management.system"
      DetailPrint "Previous application data removed"
      Goto preinstall_done
    preinstall_keep:
      DetailPrint "Keeping existing Spectrum Pro application data"
    preinstall_done:
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; 32-bit OS / x86 app uses the x86 runtime key
  ReadRegDWord $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x86" "Installed"
  ${If} $0 == 1
    DetailPrint "Visual C++ Redistributable (x86) already installed"
    Goto vcredist_done
  ${EndIf}

  ; Also check Wow6432Node in case of unusual layouts
  ReadRegDWord $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x86" "Installed"
  ${If} $0 == 1
    DetailPrint "Visual C++ Redistributable (x86) already installed"
    Goto vcredist_done
  ${EndIf}

  ${If} ${FileExists} "$INSTDIR\resources\vc_redist.x86.exe"
    DetailPrint "Installing Visual C++ Redistributable (x86) for Universal CRT..."
    CopyFiles "$INSTDIR\resources\vc_redist.x86.exe" "$TEMP\vc_redist.x86.exe"
    ; /install /quiet /norestart — silent; allow reboot codes as success-ish
    ExecWait '"$TEMP\vc_redist.x86.exe" /install /quiet /norestart' $0
    DetailPrint "VC++ redist exit code: $0"
    ${If} $0 == 0
      DetailPrint "Visual C++ Redistributable installed successfully"
    ${ElseIf} $0 == 1638
      DetailPrint "A newer VC++ Redistributable is already installed"
    ${ElseIf} $0 == 3010
      DetailPrint "VC++ Redistributable installed (reboot recommended)"
    ${Else}
      MessageBox MB_ICONEXCLAMATION "Visual C++ runtime install failed (code $0).$\r$\nIf the app will not start, install vc_redist.x86.exe from the app resources folder."
    ${EndIf}
    Delete "$TEMP\vc_redist.x86.exe"
    ; Keep a copy in resources for manual reinstall if needed
  ${Else}
    DetailPrint "WARNING: vc_redist.x86.exe was not bundled"
  ${EndIf}

  vcredist_done:

  ; Shortcuts use $OUTDIR as the working directory. Pin it to $INSTDIR so
  ; launching from Desktop/Start Menu still finds resources when installed on D:/E:.
  SetOutPath "$INSTDIR"
  CreateShortcut "$DESKTOP\SpectrumPro.lnk" "$INSTDIR\spectrum-pro.exe"
  CreateShortcut "$SMPROGRAMS\SpectrumPro.lnk" "$INSTDIR\spectrum-pro.exe"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
!macroend
