!include "WordFunc.nsh"

!macro customHeader
  BrandingText "برنامج صلحلي v${VERSION} — تطوير: الجوكر تك"
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "مرحباً بك في معالج تثبيت برنامج صلحلي v${VERSION}"
  !define MUI_WELCOMEPAGE_TEXT "سيقوم هذا المعالج بتثبيت برنامج (صلحلي - الإصدار v${VERSION}) المطور بواسطة (الجوكر تك) على جهاز الكمبيوتر الخاص بك.$\r$\n$\r$\nالنظام المتكامل لإدارة الأنشطة والخدمات المتخصصة:$\r$\n  • صيانة الأجهزة المنزلية والكهربائية$\r$\n  • مراكز وتوكيلات السماعات الطبية وفحوصات السمع$\r$\n  • إدارة المبيعات والمشتريات والمخازن وضمان الأجهزة$\r$\n  • إدارة الخزينة والحسابات والنسخ الاحتياطي التلقائي$\r$\n$\r$\nاضغط على (التالي) للمتابعة في عملية التثبيت."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customInit
  ${IfNot} ${Silent}
  ${AndIfNot} ${UAC_IsInnerInstance}
    ReadRegStr $R0 HKCU "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    ${If} $R0 == ""
      ReadRegStr $R0 HKLM "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    ${EndIf}

    ${If} $R0 != ""
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
