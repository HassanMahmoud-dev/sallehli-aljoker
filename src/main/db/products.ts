import { db, runTransaction } from './connection'
import { roundMoney, parseJsonObject, stringifyExtraData } from './utils'
import { isDemoDataHidden } from './demo'
import type { Product, ProductVariant, ProductSerial, ProductType, SerialStatus, SerialCondition } from '../../shared/types'

export function normalizeProductRow(row: Record<string, unknown>): Product {
  return {
    ...(row as unknown as Product),
    track_serial: Number(row.track_serial || 0),
    has_variants: Number(row.has_variants || 0),
    pack_size: Math.max(1, Number(row.pack_size || 1)),
    cost_price: roundMoney(row.cost_price),
    sale_price: roundMoney(row.sale_price),
    pack_cost_price: roundMoney(row.pack_cost_price),
    pack_sale_price: roundMoney(row.pack_sale_price),
    qty: Number(row.qty || 0),
    min_stock: Number(row.min_stock ?? 3),
    warranty_months: Number(row.warranty_months ?? 12),
    is_active: Number(row.is_active ?? 1),
    extra_data: parseJsonObject(row.extra_data)
  }
}

export function listProducts(filters?: {
  search?: string
  type?: string
  activeOnly?: boolean
}): Product[] {
  const q = `%${(filters?.search || '').trim()}%`
  let sql = `
    SELECT p.*,
      (SELECT COUNT(*) FROM product_serials ps WHERE ps.product_id = p.id AND ps.status = 'in_stock') as available_serials_count,
      (SELECT COUNT(*) FROM product_serials ps WHERE ps.product_id = p.id) as total_serials_count
    FROM products p
    WHERE (
      p.name LIKE ? OR p.code LIKE ? OR p.barcode LIKE ? OR p.brand LIKE ? OR
      p.model LIKE ? OR p.compatible_with LIKE ? OR p.sub_category LIKE ? OR
      EXISTS (
        SELECT 1 FROM product_variants pv
        WHERE pv.product_id = p.id AND (pv.variant_name LIKE ? OR pv.barcode LIKE ? OR pv.sku LIKE ?)
      ) OR
      EXISTS (
        SELECT 1 FROM product_serials ps
        WHERE ps.product_id = p.id AND ps.serial_no LIKE ?
      )
    )
  `
  const params: unknown[] = [q, q, q, q, q, q, q, q, q, q, q]

  if (filters?.type && filters.type !== 'all') {
    sql += ' AND p.type = ?'
    params.push(filters.type)
  }
  if (filters?.activeOnly) {
    sql += ' AND p.is_active = 1'
  }
  if (isDemoDataHidden()) {
    sql += ' AND p.is_demo = 0'
  }

  sql += ' ORDER BY p.id DESC'
  const rawRows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  const products = rawRows.map(normalizeProductRow)

  const getVariantsStmt = db.prepare(
    'SELECT * FROM product_variants WHERE product_id = ? ORDER BY id ASC'
  )
  for (const prod of products) {
    prod.variants = getVariantsStmt.all(prod.id) as ProductVariant[]
  }

  return products
}

export function getProductById(id: number): Product | undefined {
  const rawRow = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM product_serials ps WHERE ps.product_id = p.id AND ps.status = 'in_stock') as available_serials_count,
        (SELECT COUNT(*) FROM product_serials ps WHERE ps.product_id = p.id) as total_serials_count
       FROM products p
       WHERE p.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined
  if (!rawRow) return undefined
  const prod = normalizeProductRow(rawRow)
  prod.variants = db
    .prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY id ASC')
    .all(prod.id) as ProductVariant[]
  return prod
}

export function getProductByBarcode(barcode: string): {
  product: Product
  variant?: ProductVariant
  serial?: ProductSerial
} | null {
  const clean = barcode.trim()
  if (!clean) return null

  // 1. Check serial numbers first
  const serialRow = db
    .prepare('SELECT * FROM product_serials WHERE serial_no = ? LIMIT 1')
    .get(clean) as ProductSerial | undefined
  if (serialRow) {
    const rawProd = db
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(serialRow.product_id) as Record<string, unknown> | undefined
    if (rawProd) {
      const product = normalizeProductRow(rawProd)
      product.variants = db
        .prepare('SELECT * FROM product_variants WHERE product_id = ?')
        .all(product.id) as ProductVariant[]
      return { product, serial: serialRow }
    }
  }

  // 2. Check variant barcode or SKU
  const variantRow = db
    .prepare('SELECT * FROM product_variants WHERE barcode = ? OR sku = ? LIMIT 1')
    .get(clean, clean) as ProductVariant | undefined
  if (variantRow && variantRow.product_id) {
    const rawProd = db
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(variantRow.product_id) as Record<string, unknown> | undefined
    if (rawProd) {
      const product = normalizeProductRow(rawProd)
      product.variants = db
        .prepare('SELECT * FROM product_variants WHERE product_id = ?')
        .all(product.id) as ProductVariant[]
      return { product, variant: variantRow }
    }
  }

  // 3. Check product barcode or code
  const rawProd = db
    .prepare('SELECT * FROM products WHERE barcode = ? OR code = ? LIMIT 1')
    .get(clean, clean) as Record<string, unknown> | undefined
  if (rawProd) {
    const product = normalizeProductRow(rawProd)
    product.variants = db
      .prepare('SELECT * FROM product_variants WHERE product_id = ?')
      .all(product.id) as ProductVariant[]
    return { product }
  }

  return null
}

export function syncProductQtyFromChildren(productId: number): void {
  const prod = db
    .prepare('SELECT type, track_serial, has_variants FROM products WHERE id = ?')
    .get(productId) as { type: string; track_serial: number; has_variants: number } | undefined
  if (!prod) return

  if (prod.type === 'service') {
    db.prepare('UPDATE products SET qty = 0 WHERE id = ?').run(productId)
    return
  }

  if (prod.track_serial) {
    const cnt = (
      db
        .prepare(
          "SELECT COUNT(*) as cnt FROM product_serials WHERE product_id = ? AND status = 'in_stock'"
        )
        .get(productId) as { cnt: number }
    ).cnt
    db.prepare('UPDATE products SET qty = ? WHERE id = ?').run(cnt, productId)
  } else if (prod.has_variants) {
    const totalQty = (
      db
        .prepare(
          'SELECT COALESCE(SUM(qty), 0) as total FROM product_variants WHERE product_id = ? AND is_active = 1'
        )
        .get(productId) as { total: number }
    ).total
    db.prepare('UPDATE products SET qty = ? WHERE id = ?').run(totalQty, productId)
  }
}

export function saveProduct(
  data: Partial<Product> & {
    variants?: Partial<ProductVariant>[]
    initial_serials?: string[]
  }
): Product {
  return runTransaction(() => {
    const name = data.name?.trim()
    if (!name) {
      throw new Error('يرجى إدخال اسم المنتج أو الخدمة')
    }

    const type: ProductType = data.type || 'hearing_aid'
    const isService = type === 'service'
    const trackSerial = isService
      ? 0
      : data.track_serial !== undefined
        ? Number(data.track_serial)
        : type === 'hearing_aid' || type === 'cochlear_processor'
          ? 1
          : 0
    const hasVariants = isService || trackSerial ? 0 : data.has_variants ? 1 : 0
    const packSize = Math.max(1, Math.round(Number(data.pack_size || 1)))
    const costPrice = roundMoney(data.cost_price)
    const salePrice = roundMoney(data.sale_price)
    const packCostPrice = roundMoney(data.pack_cost_price || costPrice * packSize)
    const packSalePrice = roundMoney(data.pack_sale_price || salePrice * packSize)
    const code = data.code?.trim() || `PR-${Date.now().toString().slice(-5)}`
    const extraDataJson = stringifyExtraData(data.extra_data)

    let productId = data.id

    if (productId) {
      db.prepare(
        `UPDATE products SET
          code = ?, barcode = ?, name = ?, type = ?, sub_category = ?, brand = ?, model = ?,
          compatible_with = ?, track_serial = ?, has_variants = ?, unit_name = ?, pack_name = ?,
          pack_size = ?, cost_price = ?, sale_price = ?, pack_cost_price = ?, pack_sale_price = ?,
          qty = ?, min_stock = ?, warranty_months = ?, image_base64 = ?, notes = ?,
          extra_data = ?, is_active = ?
         WHERE id = ?`
      ).run(
        code,
        data.barcode?.trim() || '',
        name,
        type,
        data.sub_category?.trim() || '',
        data.brand?.trim() || '',
        data.model?.trim() || '',
        data.compatible_with?.trim() || '',
        trackSerial,
        hasVariants,
        data.unit_name?.trim() || 'قطعة',
        data.pack_name?.trim() || 'عبوة',
        packSize,
        costPrice,
        salePrice,
        packCostPrice,
        packSalePrice,
        isService ? 0 : Math.max(0, Math.round(Number(data.qty ?? 0))),
        isService ? 0 : Math.max(0, Math.round(Number(data.min_stock ?? 3))),
        Math.max(0, Math.round(Number(data.warranty_months ?? 12))),
        data.image_base64 || '',
        data.notes?.trim() || '',
        extraDataJson,
        data.is_active !== undefined ? Number(data.is_active) : 1,
        productId
      )
    } else {
      const info = db
        .prepare(
          `INSERT INTO products (
            code, barcode, name, type, sub_category, brand, model, compatible_with,
            track_serial, has_variants, unit_name, pack_name, pack_size,
            cost_price, sale_price, pack_cost_price, pack_sale_price,
            qty, min_stock, warranty_months, image_base64, notes, extra_data, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          code,
          data.barcode?.trim() || '',
          name,
          type,
          data.sub_category?.trim() || '',
          data.brand?.trim() || '',
          data.model?.trim() || '',
          data.compatible_with?.trim() || '',
          trackSerial,
          hasVariants,
          data.unit_name?.trim() || 'قطعة',
          data.pack_name?.trim() || 'عبوة',
          packSize,
          costPrice,
          salePrice,
          packCostPrice,
          packSalePrice,
          isService ? 0 : Math.max(0, Math.round(Number(data.qty ?? 0))),
          isService ? 0 : Math.max(0, Math.round(Number(data.min_stock ?? 3))),
          Math.max(0, Math.round(Number(data.warranty_months ?? 12))),
          data.image_base64 || '',
          data.notes?.trim() || '',
          extraDataJson,
          data.is_active !== undefined ? Number(data.is_active) : 1
        )
      productId = Number(info.lastInsertRowid)
    }

    // Sync variants if has_variants = 1
    if (hasVariants && Array.isArray(data.variants)) {
      const existingVariants = db
        .prepare('SELECT id FROM product_variants WHERE product_id = ?')
        .all(productId) as Array<{ id: number }>
      const incomingIds = new Set(
        data.variants.map((v) => Number(v.id || 0)).filter((id) => id > 0)
      )

      for (const ev of existingVariants) {
        if (!incomingIds.has(ev.id)) {
          db.prepare('DELETE FROM product_variants WHERE id = ?').run(ev.id)
        }
      }

      for (const v of data.variants) {
        const vName = v.variant_name?.trim() || v.size?.trim() || v.color?.trim()
        if (!vName) continue
        const vQty = Math.max(0, Math.round(Number(v.qty ?? 0)))
        const vMin = Math.max(0, Math.round(Number(v.min_stock ?? 6)))
        const vCost = v.cost_price !== null && v.cost_price !== undefined ? roundMoney(v.cost_price) : null
        const vSale = v.sale_price !== null && v.sale_price !== undefined ? roundMoney(v.sale_price) : null
        const vPackCost =
          v.pack_cost_price !== null && v.pack_cost_price !== undefined
            ? roundMoney(v.pack_cost_price)
            : null
        const vPackSale =
          v.pack_sale_price !== null && v.pack_sale_price !== undefined
            ? roundMoney(v.pack_sale_price)
            : null

        if (v.id && incomingIds.has(Number(v.id))) {
          db.prepare(
            `UPDATE product_variants SET
              variant_name = ?, size = ?, color = ?, sku = ?, barcode = ?,
              cost_price = ?, sale_price = ?, pack_cost_price = ?, pack_sale_price = ?,
              qty = ?, min_stock = ?, is_active = ?
             WHERE id = ? AND product_id = ?`
          ).run(
            vName,
            v.size?.trim() || '',
            v.color?.trim() || '',
            v.sku?.trim() || '',
            v.barcode?.trim() || '',
            vCost,
            vSale,
            vPackCost,
            vPackSale,
            vQty,
            vMin,
            v.is_active !== undefined ? Number(v.is_active) : 1,
            v.id,
            productId
          )
        } else {
          db.prepare(
            `INSERT INTO product_variants (
              product_id, variant_name, size, color, sku, barcode,
              cost_price, sale_price, pack_cost_price, pack_sale_price, qty, min_stock, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            productId,
            vName,
            v.size?.trim() || '',
            v.color?.trim() || '',
            v.sku?.trim() || '',
            v.barcode?.trim() || '',
            vCost,
            vSale,
            vPackCost,
            vPackSale,
            vQty,
            vMin,
            v.is_active !== undefined ? Number(v.is_active) : 1
          )
        }
      }
    }

    // Insert initial serials if provided for track_serial = 1
    if (trackSerial && Array.isArray(data.initial_serials) && data.initial_serials.length > 0) {
      const insertSerialStmt = db.prepare(
        `INSERT OR IGNORE INTO product_serials (product_id, serial_no, status, condition)
         VALUES (?, ?, 'in_stock', 'new')`
      )
      for (const rawSn of data.initial_serials) {
        const sn = String(rawSn || '').trim()
        if (sn) {
          insertSerialStmt.run(productId, sn)
        }
      }
    }

    syncProductQtyFromChildren(productId)

    return getProductById(productId) || listProducts()[0]
  })
}

export function deleteProduct(id: number): void {
  runTransaction(() => {
    const soldSerial = db
      .prepare("SELECT id FROM product_serials WHERE product_id = ? AND status != 'in_stock' LIMIT 1")
      .get(id) as { id: number } | undefined
    if (soldSerial) {
      throw new Error(
        'لا يمكن حذف هذا المنتج لوجود أرقام تسلسلية مباعة أو مرتبطة بعمليات سابقة. يمكنك تعطيل المنتج بدلاً من حذفه.'
      )
    }
    db.prepare('DELETE FROM product_serials WHERE product_id = ?').run(id)
    db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(id)
    db.prepare('DELETE FROM products WHERE id = ?').run(id)
  })
}

export function listProductSerials(filters?: {
  product_id?: number
  status?: string
  search?: string
}): ProductSerial[] {
  const q = `%${(filters?.search || '').trim()}%`
  let sql = `
    SELECT ps.*,
      p.name as product_name, p.brand as product_brand, p.model as product_model, p.type as product_type,
      c.name as customer_name
    FROM product_serials ps
    JOIN products p ON p.id = ps.product_id
    LEFT JOIN customers c ON c.id = ps.customer_id
    WHERE (
      ps.serial_no LIKE ? OR p.name LIKE ? OR p.brand LIKE ? OR p.model LIKE ? OR
      COALESCE(c.name, '') LIKE ? OR ps.notes LIKE ?
    )
  `
  const params: unknown[] = [q, q, q, q, q, q]

  if (filters?.product_id) {
    sql += ' AND ps.product_id = ?'
    params.push(filters.product_id)
  }
  if (filters?.status && filters.status !== 'all') {
    sql += ' AND ps.status = ?'
    params.push(filters.status)
  }
  if (isDemoDataHidden()) {
    sql += ' AND ps.is_demo = 0'
  }

  sql += ' ORDER BY ps.id DESC LIMIT 300'
  return db.prepare(sql).all(...params) as ProductSerial[]
}

export function addProductSerials(payload: {
  product_id: number
  variant_id?: number | null
  serials: string[]
  condition?: SerialCondition
  ear_side?: string
  company_warranty_start?: string | null
  company_warranty_end?: string | null
  notes?: string
  recordInTreasury?: boolean
  payment_method?: string
}): ProductSerial[] {
  return runTransaction(() => {
    const rawProd = db
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(payload.product_id) as Record<string, unknown> | undefined
    if (!rawProd) {
      throw new Error('المنتج غير موجود')
    }
    const product = normalizeProductRow(rawProd)

    const cleanSerials = Array.from(
      new Set(
        (payload.serials || [])
          .map((s) => String(s || '').trim())
          .filter((s) => s.length > 0)
      )
    )
    if (cleanSerials.length === 0) {
      throw new Error('يرجى إدخال رقم تسلسلي واحد على الأقل')
    }

    const checkExisting = db.prepare('SELECT serial_no FROM product_serials WHERE serial_no = ?')
    for (const sn of cleanSerials) {
      const exists = checkExisting.get(sn) as { serial_no: string } | undefined
      if (exists) {
        throw new Error(`الرقم التسلسلي (${sn}) مسجل مسبقاً في النظام ولا يمكن تكراره`)
      }
    }

    const insertStmt = db.prepare(
      `INSERT INTO product_serials (
        product_id, variant_id, serial_no, status, condition, ear_side,
        company_warranty_start, company_warranty_end, notes
      ) VALUES (?, ?, ?, 'in_stock', ?, ?, ?, ?, ?)`
    )

    const condition: SerialCondition = payload.condition === 'used' ? 'used' : 'new'
    for (const sn of cleanSerials) {
      insertStmt.run(
        product.id,
        payload.variant_id || null,
        sn,
        condition,
        payload.ear_side || '',
        payload.company_warranty_start || null,
        payload.company_warranty_end || null,
        payload.notes?.trim() || ''
      )
    }

    syncProductQtyFromChildren(product.id)

    db.prepare(
      `INSERT INTO inventory_movements (
        product_id, variant_id, serial_no, ref_type, movement_type, quantity, unit_cost, unit_price, notes
      ) VALUES (?, ?, ?, 'manual', 'in', ?, ?, ?, ?)`
    ).run(
      product.id,
      payload.variant_id || null,
      cleanSerials.join(', '),
      cleanSerials.length,
      product.cost_price,
      product.sale_price,
      payload.notes?.trim() || `إضافة أرقام تسلسلية (${cleanSerials.length})`
    )

    if (payload.recordInTreasury && product.cost_price > 0) {
      const totalCost = roundMoney(cleanSerials.length * product.cost_price)
      if (totalCost > 0) {
        db.prepare(
          `INSERT INTO treasury_transactions (transaction_type, category, amount, payment_method, description)
           VALUES ('expense', 'توريد منتجات وسماعات', ?, ?, ?)`
        ).run(
          totalCost,
          payload.payment_method || 'cash',
          `توريد ${cleanSerials.length} × ${product.name} (سيريال: ${cleanSerials.join(', ')})`
        )
      }
    }

    return listProductSerials({ product_id: product.id })
  })
}

export function updateProductSerialStatus(payload: {
  id: number
  status: SerialStatus
  condition?: SerialCondition
  ear_side?: string
  company_warranty_end?: string | null
  notes?: string
}): ProductSerial {
  return runTransaction(() => {
    const existing = db
      .prepare('SELECT * FROM product_serials WHERE id = ?')
      .get(payload.id) as ProductSerial | undefined
    if (!existing) {
      throw new Error('الرقم التسلسلي غير موجود')
    }

    db.prepare(
      `UPDATE product_serials SET
        status = ?,
        condition = COALESCE(?, condition),
        ear_side = COALESCE(?, ear_side),
        company_warranty_end = COALESCE(?, company_warranty_end),
        notes = COALESCE(?, notes)
       WHERE id = ?`
    ).run(
      payload.status,
      payload.condition || null,
      payload.ear_side !== undefined ? payload.ear_side : null,
      payload.company_warranty_end !== undefined ? payload.company_warranty_end : null,
      payload.notes !== undefined ? payload.notes : null,
      payload.id
    )

    syncProductQtyFromChildren(existing.product_id)

    return listProductSerials({ product_id: existing.product_id }).find(
      (s) => s.id === payload.id
    )!
  })
}

export function deleteProductSerial(id: number): void {
  runTransaction(() => {
    const existing = db
      .prepare('SELECT * FROM product_serials WHERE id = ?')
      .get(id) as ProductSerial | undefined
    if (!existing) return
    if (existing.status !== 'in_stock') {
      throw new Error('لا يمكن حذف رقم تسلسلي مباع أو مرتبط بعملية حالية')
    }
    db.prepare('DELETE FROM product_serials WHERE id = ?').run(id)
    syncProductQtyFromChildren(existing.product_id)
  })
}

export function adjustProductStock(payload: {
  product_id: number
  variant_id?: number | null
  unit: 'piece' | 'pack'
  quantity: number
  movement_type: 'in' | 'damaged'
  notes?: string
  recordInTreasury?: boolean
  payment_method?: string
}): Product {
  return runTransaction(() => {
    const rawProd = db
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(payload.product_id) as Record<string, unknown> | undefined
    if (!rawProd) throw new Error('المنتج غير موجود')
    const product = normalizeProductRow(rawProd)

    if (product.type === 'service') {
      throw new Error('الخدمات ليس لها رصيد مخزني')
    }
    if (product.track_serial) {
      throw new Error('هذا المنتج يتتبع الرقم التسلسلي؛ يرجى تعديل الرصيد من نافذة الأرقام التسلسلية')
    }

    const rawQty = Math.abs(Math.round(Number(payload.quantity || 0)))
    if (rawQty <= 0) throw new Error('الكمية يجب أن تكون أكبر من صفر')

    const multiplier = payload.unit === 'pack' ? Math.max(1, product.pack_size) : 1
    const piecesDelta = rawQty * multiplier

    let unitCost = product.cost_price
    let unitPrice = product.sale_price
    let variantLabel = ''

    if (payload.variant_id) {
      const variant = db
        .prepare('SELECT * FROM product_variants WHERE id = ? AND product_id = ?')
        .get(payload.variant_id, product.id) as ProductVariant | undefined
      if (!variant) throw new Error('المقاس / التنوع المحدد غير موجود')

      variantLabel = ` (${variant.variant_name})`
      if (variant.cost_price !== null && variant.cost_price !== undefined) {
        unitCost = Number(variant.cost_price)
      }
      if (variant.sale_price !== null && variant.sale_price !== undefined) {
        unitPrice = Number(variant.sale_price)
      }

      if (payload.movement_type === 'damaged' && variant.qty < piecesDelta) {
        throw new Error(
          `الكمية المتاحة من (${variant.variant_name}) هي ${variant.qty} ${product.unit_name} فقط ولا تكفي لخصم ${piecesDelta}`
        )
      }

      const signed = payload.movement_type === 'in' ? piecesDelta : -piecesDelta
      db.prepare('UPDATE product_variants SET qty = qty + ? WHERE id = ?').run(signed, variant.id)
      syncProductQtyFromChildren(product.id)
    } else {
      if (payload.movement_type === 'damaged' && product.qty < piecesDelta) {
        throw new Error(
          `الكمية المتاحة من (${product.name}) هي ${product.qty} ${product.unit_name} فقط ولا تكفي لخصم ${piecesDelta}`
        )
      }
      const signed = payload.movement_type === 'in' ? piecesDelta : -piecesDelta
      db.prepare('UPDATE products SET qty = qty + ? WHERE id = ?').run(signed, product.id)
    }

    const unitDesc =
      payload.unit === 'pack'
        ? `${rawQty} ${product.pack_name} (${piecesDelta} ${product.unit_name})`
        : `${piecesDelta} ${product.unit_name}`

    db.prepare(
      `INSERT INTO inventory_movements (
        product_id, variant_id, ref_type, movement_type, quantity, unit_cost, unit_price, notes
      ) VALUES (?, ?, 'manual', ?, ?, ?, ?, ?)`
    ).run(
      product.id,
      payload.variant_id || null,
      payload.movement_type,
      piecesDelta,
      unitCost,
      unitPrice,
      payload.notes?.trim() ? `${unitDesc} — ${payload.notes.trim()}` : unitDesc
    )

    if (payload.movement_type === 'in' && payload.recordInTreasury) {
      const totalCost =
        payload.unit === 'pack' && product.pack_cost_price > 0
          ? roundMoney(rawQty * product.pack_cost_price)
          : roundMoney(piecesDelta * unitCost)
      if (totalCost > 0) {
        db.prepare(
          `INSERT INTO treasury_transactions (transaction_type, category, amount, payment_method, description)
           VALUES ('expense', 'توريد منتجات وبطاريات', ?, ?, ?)`
        ).run(
          totalCost,
          payload.payment_method || 'cash',
          `توريد مخزني: ${unitDesc} من ${product.name}${variantLabel}`
        )
      }
    }

    return getProductById(product.id)!
  })
}

// ==========================================
// SUPPLIERS MANAGEMENT & STATEMENTS (3A)
// ==========================================
