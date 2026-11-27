!define CADENCE_AUDIO_PROGID "${APP_ID}.Audio"

!macro cadenceAudioExtensions action
  !insertmacro ${action} "mp3"
  !insertmacro ${action} "wav"
  !insertmacro ${action} "ogg"
  !insertmacro ${action} "flac"
  !insertmacro ${action} "m4a"
  !insertmacro ${action} "aac"
  !insertmacro ${action} "webm"
  !insertmacro ${action} "opus"
!macroend

!macro registerCadenceAudioExtension ext
  WriteRegNone SHELL_CONTEXT "Software\Classes\.${ext}\OpenWithProgids" "${CADENCE_AUDIO_PROGID}"
!macroend

!macro unregisterCadenceAudioExtension ext
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.${ext}\OpenWithProgids" "${CADENCE_AUDIO_PROGID}"
!macroend

!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\${CADENCE_AUDIO_PROGID}" "" "CADENCE audio file"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${CADENCE_AUDIO_PROGID}\DefaultIcon" "" '"$appExe",0'
  WriteRegStr SHELL_CONTEXT "Software\Classes\${CADENCE_AUDIO_PROGID}\shell\open\command" "" '"$appExe" "%1"'
  !insertmacro cadenceAudioExtensions registerCadenceAudioExtension
  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
!macroend

!macro customUnInstall
  !insertmacro cadenceAudioExtensions unregisterCadenceAudioExtension
  DeleteRegKey SHELL_CONTEXT "Software\Classes\${CADENCE_AUDIO_PROGID}"
!macroend
