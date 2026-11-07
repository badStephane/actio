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
;
; WebView2 minimum (2.2.0, risque R1) : le front cible chrome111 (Tailwind 4, Vite 8). Le template
; (CLI 2.12.4, Section WebView2) n'installe le runtime que s'il est ABSENT et jamais en /UPDATE ;
; il ne met jamais à niveau un runtime présent mais ancien (fréquent sur un poste hors ligne).
; ACTIO_ENSURE_WEBVIEW2 relance donc l'installeur hors ligne déjà embarqué (${WEBVIEW2INSTALLERPATH},
; même fichier que la Section WebView2) si la version lue est absente ou < 111. Succès jugé sur la
; version relue dans le registre, pas sur le code retour. Échec (D30) : /S journal + Abort, /P message +
; journal + Abort, graphique question Oui/Non (Non = Abort) ; code de sortie 2 ; journal
; %TEMP%\Actio-installation.log. Ne touche à aucune donnée.

!define ACTIO_OLD_PRODUCTNAME "Gestion des Inscriptions"
!define ACTIO_OLD_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${ACTIO_OLD_PRODUCTNAME}"
!define ACTIO_OLD_MANUPRODUCTKEY "Software\badstephane\${ACTIO_OLD_PRODUCTNAME}"
!define ACTIO_OLD_DEFAULT_EXE "app.exe"

Var ActioMigrated       ; 1 si une ancienne installation a été retirée par ce hook
Var ActioOldDir         ; dossier d'installation de l'ancienne app
Var ActioOldExe         ; nom de l'exe de l'ancienne app (valeur MainBinaryName, sinon app.exe)
Var ActioHadDesktopLnk  ; 1 si l'ancien raccourci Bureau existait

!define ACTIO_WEBVIEW2_MIN "111.0.0.0"
!define ACTIO_WEBVIEW2_CLIENT "Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
!define ACTIO_WEBVIEW2_TMP "$TEMP\ActioWebView2RuntimeInstaller.exe"
!define ACTIO_INSTALL_LOG "$TEMP\Actio-installation.log"

Var ActioWv2Version     ; plus haute version « pv » trouvée (vide si aucun runtime)

; Écrit une ligne dans le détail de l'installation et dans %TEMP%\Actio-installation.log.
!macro ACTIO_LOG text
  DetailPrint "${text}"
  FileOpen $9 "${ACTIO_INSTALL_LOG}" a
  ${IfNot} ${Errors}
    FileSeek $9 0 END
    FileWrite $9 "${text}$\r$\n"
    FileClose $9
  ${EndIf}
  ClearErrors
!macroend

; Garde dans $ActioWv2Version la plus haute des deux versions (candidate dans ${candidate}).
!macro ACTIO_KEEP_MAX_VERSION candidate
  ${If} ${candidate} != ""
    ${If} $ActioWv2Version == ""
      StrCpy $ActioWv2Version ${candidate}
    ${Else}
      ${VersionCompare} ${candidate} $ActioWv2Version $0
      ${If} $0 = 1
        StrCpy $ActioWv2Version ${candidate}
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

; Lit « pv » aux trois emplacements utilisés par le template (HKLM 32 bits, HKLM, HKCU).
!macro ACTIO_READ_WEBVIEW2_VERSION
  StrCpy $ActioWv2Version ""
  ReadRegStr $5 HKLM "SOFTWARE\WOW6432Node\${ACTIO_WEBVIEW2_CLIENT}" "pv"
  !insertmacro ACTIO_KEEP_MAX_VERSION $5
  ReadRegStr $5 HKLM "SOFTWARE\${ACTIO_WEBVIEW2_CLIENT}" "pv"
  !insertmacro ACTIO_KEEP_MAX_VERSION $5
  ReadRegStr $5 HKCU "SOFTWARE\${ACTIO_WEBVIEW2_CLIENT}" "pv"
  !insertmacro ACTIO_KEEP_MAX_VERSION $5
!macroend

; $0 = 1 si $ActioWv2Version est absente ou inférieure au minimum, sinon 0.
!macro ACTIO_WEBVIEW2_TOO_OLD
  ${If} $ActioWv2Version == ""
    StrCpy $0 1
  ${Else}
    ${VersionCompare} $ActioWv2Version "${ACTIO_WEBVIEW2_MIN}" $0
    ${If} $0 = 2
      StrCpy $0 1
    ${Else}
      StrCpy $0 0
    ${EndIf}
  ${EndIf}
!macroend

!macro ACTIO_ENSURE_WEBVIEW2
  !if "${INSTALLWEBVIEW2MODE}" == "offlineInstaller"
    !insertmacro ACTIO_READ_WEBVIEW2_VERSION
    !insertmacro ACTIO_WEBVIEW2_TOO_OLD
    ${If} $0 = 1
      !insertmacro ACTIO_LOG "WebView2 « $ActioWv2Version » inférieur à ${ACTIO_WEBVIEW2_MIN} : mise à niveau avec l'installeur embarqué"
      File "/oname=${ACTIO_WEBVIEW2_TMP}" "${WEBVIEW2INSTALLERPATH}"
      ExecWait '"${ACTIO_WEBVIEW2_TMP}" /silent /install' $1
      Delete "${ACTIO_WEBVIEW2_TMP}"
      !insertmacro ACTIO_READ_WEBVIEW2_VERSION
      !insertmacro ACTIO_WEBVIEW2_TOO_OLD
      ${If} $0 = 1
        !insertmacro ACTIO_LOG "Échec de la mise à niveau de WebView2 (code $1, version lue « $ActioWv2Version »)"
        ; Décision D30 : l'échec annule l'installation, en PREINSTALL, avant toute migration et toute
        ; copie ; la base n'est migrée qu'au premier lancement de la nouvelle version, donc la version
        ; en place reste intacte et utilisable. Code de sortie 2 (non nul) dès qu'on annule.
        ${If} ${Silent}
          ; /S strict : aucune interface, journal seulement.
          !insertmacro ACTIO_LOG "Installation annulée (/S) : WebView2 < ${ACTIO_WEBVIEW2_MIN}, version en place conservée"
          SetErrorLevel 2
          Abort
        ${ElseIf} $PassiveMode = 1
          ; /P (updater) : message, journal, annulation.
          MessageBox MB_OK|MB_ICONEXCLAMATION "Actio n'a pas pu mettre à jour le composant d'affichage Windows (WebView2, version 111 minimum requise). La version actuelle d'Actio reste installée et utilisable. Connectez ce poste à internet une fois, ou contactez le support, puis relancez la mise à jour."
          !insertmacro ACTIO_LOG "Installation annulée (/P) : WebView2 < ${ACTIO_WEBVIEW2_MIN}, version en place conservée"
          SetErrorLevel 2
          Abort
        ${Else}
          ; Mode graphique : question, « Non » annule.
          MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "Le composant Microsoft Edge WebView2 de ce poste est trop ancien (version « $ActioWv2Version », minimum 111) et sa mise à niveau a échoué.$\r$\n$\r$\nSans lui, ${PRODUCTNAME} s'affichera sans mise en forme. Solution : connecter le poste à internet une fois, ou installer « Microsoft Edge WebView2 Runtime » (version hors ligne) depuis une clé USB, puis relancer cette installation.$\r$\n$\r$\nOui : installer quand même. Non : annuler (la version actuelle reste installée et utilisable)." IDYES actio_wv2_continue
          !insertmacro ACTIO_LOG "Installation annulée (mode graphique) : WebView2 < ${ACTIO_WEBVIEW2_MIN}, version en place conservée"
          SetErrorLevel 2
          Abort
          actio_wv2_continue:
          !insertmacro ACTIO_LOG "WebView2 < ${ACTIO_WEBVIEW2_MIN} : installation poursuivie à la demande de l'utilisateur"
        ${EndIf}
      ${Else}
        !insertmacro ACTIO_LOG "WebView2 mis à niveau : $ActioWv2Version"
      ${EndIf}
    ${EndIf}
  !endif
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; WebView2 d'abord : un échec annule tout AVANT de retirer l'ancienne app.
  !insertmacro ACTIO_ENSURE_WEBVIEW2
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
