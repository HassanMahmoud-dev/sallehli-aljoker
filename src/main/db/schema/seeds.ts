import { getDb } from '../connection'
import { getDefaultAutoBackupDir } from '../connection'
import { hashPassword, signSubscription } from '../crypto'
import type { BusinessType, CenterSettings } from '../../../shared/types'
import { APPLIANCES_PROFILE, HEARING_AIDS_PROFILE, type BusinessProfile } from '../../../shared/businessProfiles'

export function seedDefaults(targetType?: BusinessType): void {
  const db = getDb()

  let activeType: BusinessType = targetType || 'appliances'
  if (!targetType) {
    try {
      const bRow = db
        .prepare("SELECT value FROM settings WHERE key = 'business_type'")
        .get() as { value?: string } | undefined
      if (bRow?.value === 'hearing_aids') {
        activeType = 'hearing_aids'
      }
    } catch {
      // Ignore
    }
  }
  const profile = activeType === 'hearing_aids' ? HEARING_AIDS_PROFILE : APPLIANCES_PROFILE

  // 1. Ensure default Super Admin (admin / 8520) exists
  const existingAdmin = db
    .prepare('SELECT id FROM users WHERE username = ?')
    .get('admin') as { id: number } | undefined

  if (!existingAdmin) {
    const hashed = hashPassword('8520')
    const sig = signSubscription('admin', 'super_admin', null)
    db.prepare(
      `INSERT INTO users (username, password_hash, full_name, phone, role, is_active, subscription_sig, notes)
       VALUES (?, ?, ?, ?, 'super_admin', 1, ?, ?)`
    ).run(
      'admin',
      hashed,
      'السوبر أدمن (مالك النظام)',
      '01000000000',
      sig,
      'الحساب الرئيسي لمالك البرنامج بالكامل'
    )
  }

  // 2. Ensure default Center Settings exist
  const defaultSettings: CenterSettings = {
    center_name: profile.centerNameDefault,
    center_subtitle: profile.centerSubtitleDefault,
    phone1: '01012345678',
    phone2: '01112345678',
    whatsapp: '201012345678',
    address: 'القاهرة - شارع التحرير الرئيسي - بجوار محطة المترو',
    logo_base64: '',
    default_print_format: 'a4',
    default_inspection_fee: activeType === 'hearing_aids' ? 200 : 150,
    default_warranty_months: 6,
    warranty_terms:
      '1. يشمل الضمان القطع المستبدلة والعطل الذي تم إصلاحه فقط خلال فترة الضمان المحددة.\n2. لا يشمل الضمان الأعطال الناتجة عن سوء الاستخدام أو الكسر.\n3. يرجى الاحتفاظ بهذه الفاتورة لتقديمها عند طلب الصيانة بالضمان.',
    receipt_footer: profile.receiptFooterDefault,
    update_url: 'HassanMahmoud-dev/sallehli-aljoker',
    auto_backup_enabled: 1,
    auto_backup_dir: getDefaultAutoBackupDir(),
    auto_backup_keep_count: 10
  }

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  for (const [k, v] of Object.entries(defaultSettings)) {
    insertSetting.run(k, String(v ?? ''))
  }

  // 3. Seed default lookup items per business profile & category if that category is empty
  const countCategoryStmt = db.prepare(
    'SELECT COUNT(*) as cnt FROM lookup_items WHERE business_type = ? AND category = ?'
  )
  const insertLookup = db.prepare(
    'INSERT OR IGNORE INTO lookup_items (category, value, sort_order, is_active, business_type) VALUES (?, ?, ?, 1, ?)'
  )

  const seedCategoryIfEmpty = (businessType: BusinessType, category: string, values: string[]): void => {
    const cnt = (countCategoryStmt.get(businessType, category) as { cnt: number }).cnt
    if (cnt === 0) {
      values.forEach((val, idx) => {
        insertLookup.run(category, val, idx, businessType)
      })
    }
  }

  const profiles: BusinessProfile[] = [APPLIANCES_PROFILE, HEARING_AIDS_PROFILE]

  for (const profile of profiles) {
    seedCategoryIfEmpty(profile.id, 'device_type', profile.defaultDeviceTypes)
    seedCategoryIfEmpty(profile.id, 'brand', profile.defaultBrands)
    seedCategoryIfEmpty(profile.id, 'part_category', profile.defaultPartCategories)
    if (profile.extraLookups) {
      for (const [cat, items] of Object.entries(profile.extraLookups)) {
        if (items && items.length > 0) {
          seedCategoryIfEmpty(profile.id, cat, items as string[])
        }
      }
    }
  }

  // 4. Seed default custom field definitions per business profile
  const countCustomFieldsStmt = db.prepare(
    'SELECT COUNT(*) as cnt FROM custom_field_defs WHERE business_type = ?'
  )
  const insertCustomFieldStmt = db.prepare(
    `INSERT OR IGNORE INTO custom_field_defs (
      business_type, entity, key, label, type, options, required, show_in_table, sort_order, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  )

  for (const profile of profiles) {
    if (profile.defaultCustomFields && profile.defaultCustomFields.length > 0) {
      const cnt = (countCustomFieldsStmt.get(profile.id) as { cnt: number }).cnt
      if (cnt === 0) {
        profile.defaultCustomFields.forEach((f, idx) => {
          insertCustomFieldStmt.run(
            profile.id,
            f.entity,
            f.key,
            f.label,
            f.type,
            JSON.stringify(f.options || []),
            f.required ? 1 : 0,
            f.show_in_table ? 1 : 0,
            f.sort_order ?? idx + 1
          )
        })
      }
    }
  }
}
