; Hooks NSIS d'Actio (bundle.windows.nsis.installerHooks dans tauri.conf.json).
;
; Rôle : migrer une installation « Gestion des Inscriptions » (2.0.2 et avant) vers « Actio ».
; Le template Tauri dérive le dossier d'installation, la clé de désinstallation et les raccourcis
; du productName. Sans ce hook, un poste mis à jour garderait DEUX applications installées.
;
; Garanties :
; - Idempotent : sans clé de désinstallation « Gestion des Inscriptions » dans HKCU, rien n'est fait.
; - Ne touche JAMAIS aux données : $APPDATA\com.badstephane.gestion-inscription (base, backups) et
;   $LOCALAPPDATA\com.badstephane.gestion-inscription (logs, WebView2) dépendent de l'identifier,
;   inchangé. Aucune commande de ce fichier ne vise ces dossiers.
; - L'ancien désinstalleur est lancé avec /S /UPDATE. Il a été construit par @tauri-apps/cli 2.11.0
;   (package-lock de v2.0.2, tauri-bundler 2.9.0) : dans ce template, la suppression des données
;   exige « case cochée ET pas /UPDATE » (installer.nsi, Section Uninstall, l. 864-865).
;   Avec /UPDATE, la condition est fausse quel que soit l'état de la case, et en /S la page qui lit
;   la case (un.ConfirmLeave, l. 452-455) n'est jamais affichée.
; - En /UPDATE, l'ancien désinstalleur garde ses raccourcis (l. 817) : ce hook les supprime lui-même,
;   seulement s'ils pointent vers l'ancien exe.
; - Ce hook est compilé par @tauri-apps/cli 2.12.4 : son template ne ferme que l'app lancée depuis
;   le NOUVEAU dossier (Restart Manager sur $INSTDIR\app.exe, l. 690), d'où la fermeture ici.
; - Fonctionne en mode graphique, /P (passif, celui de l'updater : /P /R /UPDATE /ARGS) et /S.
;
; Limite : seul le mode currentUser (défaut, HKCU) est géré, comme les installations existantes.
; startMenuFolder n'est pas configuré : le raccourci est directement dans $SMPROGRAMS.

!define ACTIO_OLD_PRODUCTNAME "Gestion des Inscriptions"
!define ACTIO_OLD_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${ACTIO_OLD_PRODUCTNAME}"
!define ACTIO_OLD_MANUPRODUCTKEY "Software\badstephane\${ACTIO_OLD_PRODUCTNAME}"
!define ACTIO_OLD_DEFAULT_EXE "app.exe"

Var ActioMigrated       ; 1 si une ancienne installation a été retirée par ce hook
Var ActioOldDir         ; dossier d'installation de l'ancienne app
Var ActioOldExe         ; nom de l'exe de l'ancienne app (valeur MainBinaryName, sinon app.exe)
Var ActioHadDesktopLnk  ; 1 si l'ancien raccourci Bureau existait

!macro NSIS_HOOK_PREINSTALL
  StrCpy $ActioMigrated 0
  StrCpy $ActioHadDesktopLnk 0
  !if "${PRODUCTNAME}" != "${ACTIO_OLD_PRODUCTNAME}"
    ReadRegStr $0 HKCU "${ACTIO_OLD_UNINSTKEY}" "DisplayName"
    ${If} $0 == "${ACTIO_OLD_PRODUCTNAME}"
      ; Dossier : clé fabricant (valeur par défaut, sans guillemets), sinon InstallLocation ("...").
      ReadRegStr $ActioOldDir HKCU "${ACTIO_OLD_MANUPRODUCTKEY}" ""
      ${If} $ActioOldDir == ""
        ReadRegStr $ActioOldDir HKCU "${ACTIO_OLD_UNINSTKEY}" "InstallLocation"
        StrCpy $0 $ActioOldDir 1
        ${If} $0 == '"'
          StrCpy $ActioOldDir $ActioOldDir -1 1
        ${EndIf}
      ${EndIf}
      ReadRegStr $ActioOldExe HKCU "${ACTIO_OLD_UNINSTKEY}" "MainBinaryName"
      ${If} $ActioOldExe == ""
        StrCpy $ActioOldExe "${ACTIO_OLD_DEFAULT_EXE}"
      ${EndIf}
      DetailPrint "Migration : ancienne installation « ${ACTIO_OLD_PRODUCTNAME} » dans $ActioOldDir"

      ; 1. Fermer l'ancienne app si elle tourne (demande en mode graphique, automatique en /P et /S).
      nsis_tauri_utils::FindProcessCurrentUser "$ActioOldExe"
      Pop $0
      ${If} $0 = 0
        ${IfNot} ${Silent}
        ${AndIf} $PassiveMode <> 1
          MessageBox MB_OKCANCEL|MB_ICONINFORMATION "${ACTIO_OLD_PRODUCTNAME} est ouvert. Il va être fermé pour installer ${PRODUCTNAME}." IDOK actio_kill_confirmed
          Abort
          actio_kill_confirmed:
        ${EndIf}
        nsis_tauri_utils::KillProcessCurrentUser "$ActioOldExe"
        Pop $0
        Sleep 500
      ${EndIf}

      ; 2. Noter l'ancien raccourci Bureau (recréé au nom d'Actio en fin d'installation).
      ${If} $ActioOldDir != ""
        !insertmacro IsShortcutTarget "$DESKTOP\${ACTIO_OLD_PRODUCTNAME}.lnk" "$ActioOldDir\$ActioOldExe"
        Pop $0
        StrCpy $ActioHadDesktopLnk $0
      ${EndIf}

      ; 3. Ancien désinstalleur en mode silencieux ET mise à jour : retire l'exe et la clé
      ;    « Applications installées », jamais les données (voir l'en-tête). _?= le fait attendre.
      ${If} $ActioOldDir != ""
      ${AndIf} ${FileExists} "$ActioOldDir\uninstall.exe"
        ExecWait '"$ActioOldDir\uninstall.exe" /S /UPDATE _?=$ActioOldDir' $0
        DetailPrint "Ancien désinstalleur terminé (code $0)"
      ${EndIf}

      ; 4. Filet de sécurité, si le désinstalleur manquait ou a échoué : fichiers connus de l'ancien
      ;    dossier uniquement, puis RMDir SANS /r (le dossier n'est supprimé que s'il est vide).
      ${If} $ActioOldDir != ""
      ${AndIf} $ActioOldDir != $INSTDIR
        Delete "$ActioOldDir\$ActioOldExe"
        Delete "$ActioOldDir\uninstall.exe"
        RMDir "$ActioOldDir"
      ${EndIf}

      ; 5. Raccourcis de l'ancienne app (menu Démarrer, Bureau), seulement s'ils visent l'ancien exe.
      ${If} $ActioOldDir != ""
        !insertmacro IsShortcutTarget "$SMPROGRAMS\${ACTIO_OLD_PRODUCTNAME}.lnk" "$ActioOldDir\$ActioOldExe"
        Pop $0
        ${If} $0 = 1
          !insertmacro UnpinShortcut "$SMPROGRAMS\${ACTIO_OLD_PRODUCTNAME}.lnk"
          Delete "$SMPROGRAMS\${ACTIO_OLD_PRODUCTNAME}.lnk"
        ${EndIf}
        ${If} $ActioHadDesktopLnk = 1
          !insertmacro UnpinShortcut "$DESKTOP\${ACTIO_OLD_PRODUCTNAME}.lnk"
          Delete "$DESKTOP\${ACTIO_OLD_PRODUCTNAME}.lnk"
        ${EndIf}
      ${EndIf}

      ; 6. Clés de registre de l'ancienne app (déjà retirée par le désinstalleur s'il a tourné).
      DeleteRegKey HKCU "${ACTIO_OLD_UNINSTKEY}"
      DeleteRegKey HKCU "${ACTIO_OLD_MANUPRODUCTKEY}"

      StrCpy $ActioMigrated 1
    ${EndIf}
  !endif
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; En /UPDATE (updater), le template ne crée aucun raccourci (CreateOrUpdateStartMenuShortcut) :
  ; après une migration, on crée ceux d'Actio s'ils manquent. Sans migration, rien n'est fait.
  ${If} $ActioMigrated = 1
    ${If} $NoShortcutMode <> 1
    ${AndIfNot} ${FileExists} "$SMPROGRAMS\${PRODUCTNAME}.lnk"
      CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
      !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    ${EndIf}
    ${If} $ActioHadDesktopLnk = 1
    ${AndIfNot} ${FileExists} "$DESKTOP\${PRODUCTNAME}.lnk"
      CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
      !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
    ${EndIf}
  ${EndIf}
!macroend
