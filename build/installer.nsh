!include "WordFunc.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
Var ActivityDialog
Var RadioAppliances
Var RadioHearingAids
Var ActivityChoice
Var IsFirstInstall
!endif

!macro customHeader
  BrandingText "برنامج صلحلي v${VERSION} — تطوير: الجوكر تك"
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "مرحباً بك في معالج تثبيت برنامج صلحلي v${VERSION}"
  !define MUI_WELCOMEPAGE_TEXT "سيقوم هذا المعالج بتثبيت برنامج (صلحلي - الإصدار v${VERSION}) المطور بواسطة (الجوكر تك) على جهاز الكمبيوتر الخاص بك.$\r$\n$\r$\nالنظام المتكامل لإدارة الأنشطة والخدمات المتخصصة:$\r$\n  • صيانة الأجهزة المنزلية والكهربائية$\r$\n  • مراكز وتوكيلات السماعات الطبية وفحوصات السمع$\r$\n  • إدارة المبيعات والمشتريات والمخازن وضمان الأجهزة$\r$\n  • إدارة الخزينة والحسابات والنسخ الاحتياطي التلقائي$\r$\n$\r$\nاضغط على (التالي) للمتابعة في عملية التثبيت."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customInit
  StrCpy $ActivityChoice "appliances"
  StrCpy $IsFirstInstall "1"

  ${IfNot} ${Silent}
  ${AndIfNot} ${UAC_IsInnerInstance}
    ReadRegStr $R0 HKCU "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    ${If} $R0 == ""
      ReadRegStr $R0 HKLM "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    ${EndIf}

    ${If} $R0 != ""
      StrCpy $IsFirstInstall "0"
      ${VersionCompare} "$R0" "${VERSION}" $R1
      ${If} $R1 == 2
        # Installed version ($R0) is older than installer version (${VERSION})
        MessageBox MB_ICONINFORMATION|MB_OKCANCEL "تنبيه تحديث من الجوكر تك:$\r$\n$\r$\nيوجد إصدار أقدم من البرنامج مثبت حالياً على هذا الجهاز (الإصدار المثبت: v$R0).$\r$\n$\r$\nسيقوم معالج التثبيت الآن بتحديث البرنامج تلقائياً إلى الإصدار الجديد (v${VERSION}) مع الحفاظ الكامل على قاعدة البيانات ونشاط المركز وجميع الفواتير والإعدادات المسجلة.$\r$\n$\r$\nاضغط (موافق) لبدء التحديث، أو (إلغاء الأمر) للخروج." IDOK +2
        Quit
      ${ElseIf} $R1 == 0
        # Same version is already installed
        MessageBox MB_ICONINFORMATION|MB_OKCANCEL "تنبيه من الجوكر تك:$\r$\n$\r$\nالإصدار الحالي (v${VERSION}) من برنامج (صلحلي) مثبت بالفعل على جهازك.$\r$\n$\r$\nهل ترغب في إعادة تثبيت البرنامج وتحديث ملفاته مع الحفاظ على بياناتك؟" IDOK +2
        Quit
      ${ElseIf} $R1 == 1
        # Installed version is newer
        MessageBox MB_ICONEXCLAMATION|MB_OKCANCEL "تنبيه:$\r$\n$\r$\nيوجد إصدار أحدث من البرنامج (v$R0) مثبت بالفعل على النظام مقارنة بهذا المثبت (v${VERSION}).$\r$\n$\r$\nهل تريد المتابعة على أي حال؟" IDOK +2
        Quit
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!ifndef BUILD_UNINSTALLER
Function ActivitySelectPage
  # في حالة التحديث (وجود إصدار سابق مثبت)، يتم تخطي هذه الصفحة تماماً
  ${If} $IsFirstInstall == "0"
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $ActivityDialog
  ${If} $ActivityDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 28u "مرحباً بك! يرجى اختيار النشاط الأساسي لمركزك لتخصيص جداول قاعدة البيانات:$\r$\n(ملاحظة: يظهر هذا الخيار عند تثبيت البرنامج لأول مرة فقط لإنشاء الجداول المخصصة لنشاطك)"
  Pop $0

  ${NSD_CreateRadioButton} 10u 34u 95% 18u "1. نشاط صيانة الأجهزة الكهربائية (غسالات، ثلاجات، تكييفات، شاشات، قطع غيار وأجهزة منزلية)"
  Pop $RadioAppliances

  ${NSD_CreateRadioButton} 10u 56u 95% 18u "2. نشاط صيانة وتوكيل السماعات الطبية (سماعات طبية، قواقع، قياس سمع، قوالب، مبيعات وضمان)"
  Pop $RadioHearingAids

  # تحديد الخيار الافتراضي
  ${NSD_Check} $RadioAppliances
  StrCpy $ActivityChoice "appliances"

  nsDialogs::Show
FunctionEnd

Function ActivitySelectPageLeave
  ${NSD_GetState} $RadioHearingAids $0
  ${If} $0 == 1
    StrCpy $ActivityChoice "hearing_aids"
  ${Else}
    StrCpy $ActivityChoice "appliances"
  ${EndIf}

  # حفظ الاختيار في سجل النظام Windows Registry
  WriteRegStr HKCU "Software\Sallehli" "BusinessType" "$ActivityChoice"
  WriteRegStr HKLM "Software\Sallehli" "BusinessType" "$ActivityChoice"
FunctionEnd
!endif

!macro customPageAfterChangeDir
  Page custom ActivitySelectPage ActivitySelectPageLeave
!macroend

!macro customInstall
  ${If} $ActivityChoice != ""
    # كتابة ملف الإعداد الأولي داخل مسار تثبيت البرنامج
    FileOpen $0 "$INSTDIR\initial-activity.json" w
    FileWrite $0 '{"business_type":"$ActivityChoice"}'
    FileClose $0

    # وكتابة نسخة إضافية في مسار بيانات المستخدم %APPDATA%\sallehli
    CreateDirectory "$APPDATA\sallehli"
    FileOpen $0 "$APPDATA\sallehli\initial-activity.json" w
    FileWrite $0 '{"business_type":"$ActivityChoice"}'
    FileClose $0
  ${EndIf}
!macroend
