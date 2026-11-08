import { db, runTransaction } from '../connection'
import { roundMoney, parseJsonObject, stringifyExtraData, getLocalDateString, generateNextNumber } from '../utils'
import { listFollowups } from './followups'
import { isDemoDataHidden } from '../demo'
import type { HearingTest, AudiogramPoint, FollowupItem } from '../../../shared/types'

function generateNextTestNumber(): string {
  return generateNextNumber(db, 'hearing_tests', 'test_number', 'AUD-', 4)
}


export function calculatePtaAndSuggestLoss(points: AudiogramPoint[]): {
  pta_right: number | null
  pta_left: number | null
  loss_degree_right: string
  loss_degree_left: string
  loss_type_right: string
  loss_type_left: string
} {
  const ptaFreqs = new Set([500, 1000, 2000, 4000])

  const computeForEar = (ear: 'right' | 'left') => {
    const allAirPts = points.filter(
      (p) => p.ear === ear && p.conduction === 'air' && ptaFreqs.has(Number(p.frequency))
    )
    const airPts = allAirPts.filter((p) => Number(p.no_response || 0) !== 1)
    const bonePts = points.filter(
      (p) =>
        p.ear === ear &&
        p.conduction === 'bone' &&
        ptaFreqs.has(Number(p.frequency)) &&
        Number(p.no_response || 0) !== 1
    )

    if (allAirPts.length === 0) {
      return { pta: null, degree: '', type: '' }
    }

    if (airPts.length === 0) {
      // All PTA air conduction points were No Response (NR)
      return {
        pta: 120,
        degree: 'ضعف عميق (Profound >90 dB)',
        type: 'ضعف سمعي حسي عصبي (Sensorineural)'
      }
    }

    const airAvg =
      Math.round(
        (airPts.reduce((sum, p) => sum + Number(p.db_value), 0) / airPts.length) * 10
      ) / 10

    let degree = 'طبيعي (Normal)'
    if (airAvg <= 25) degree = 'طبيعي (≤25 dB)'
    else if (airAvg <= 40) degree = 'ضعف خفيف (Mild 26-40 dB)'
    else if (airAvg <= 55) degree = 'ضعف متوسط (Moderate 41-55 dB)'
    else if (airAvg <= 70) degree = 'متوسط الشدة (Mod-Severe 56-70 dB)'
    else if (airAvg <= 90) degree = 'ضعف شديد (Severe 71-90 dB)'
    else degree = 'ضعف عميق (Profound >90 dB)'

    let type = 'سمع طبيعي'
    if (airAvg > 25) {
      if (bonePts.length > 0) {
        const boneAvg =
          bonePts.reduce((sum, p) => sum + Number(p.db_value), 0) / bonePts.length
        const abg = airAvg - boneAvg
        if (boneAvg <= 25 && abg >= 15) {
          type = 'ضعف سمعي توصيلي (Conductive)'
        } else if (boneAvg > 25 && abg < 15) {
          type = 'ضعف سمعي حسي عصبي (Sensorineural)'
        } else {
          type = 'ضعف سمعي مختلط (Mixed)'
        }
      } else {
        type = 'ضعف سمعي حسي عصبي (Sensorineural)'
      }
    }

    return { pta: airAvg, degree, type }
  }

  const r = computeForEar('right')
  const l = computeForEar('left')

  return {
    pta_right: r.pta,
    pta_left: l.pta,
    loss_degree_right: r.degree,
    loss_degree_left: l.degree,
    loss_type_right: r.type,
    loss_type_left: l.type
  }
}

export function normalizeHearingTestRow(row: Record<string, unknown>): HearingTest {
  const id = Number(row.id)
  const points = db
    .prepare(
      `SELECT * FROM audiogram_points
       WHERE test_id = ?
       ORDER BY ear ASC, conduction ASC, frequency ASC`
    )
    .all(id) as AudiogramPoint[]

  return {
    ...(row as unknown as HearingTest),
    srt_right: row.srt_right !== null && row.srt_right !== undefined ? Number(row.srt_right) : null,
    srt_left: row.srt_left !== null && row.srt_left !== undefined ? Number(row.srt_left) : null,
    sds_right: row.sds_right !== null && row.sds_right !== undefined ? Number(row.sds_right) : null,
    sds_left: row.sds_left !== null && row.sds_left !== undefined ? Number(row.sds_left) : null,
    mcl_right: row.mcl_right !== null && row.mcl_right !== undefined ? Number(row.mcl_right) : null,
    mcl_left: row.mcl_left !== null && row.mcl_left !== undefined ? Number(row.mcl_left) : null,
    ucl_right: row.ucl_right !== null && row.ucl_right !== undefined ? Number(row.ucl_right) : null,
    ucl_left: row.ucl_left !== null && row.ucl_left !== undefined ? Number(row.ucl_left) : null,
    pta_right: row.pta_right !== null && row.pta_right !== undefined ? Number(row.pta_right) : null,
    pta_left: row.pta_left !== null && row.pta_left !== undefined ? Number(row.pta_left) : null,
    points
  }
}

export function listHearingTests(filters?: {
  patient_id?: number
  search?: string
}): HearingTest[] {
  const clauses: string[] = ['1=1']
  const params: unknown[] = []

  if (filters?.patient_id) {
    clauses.push('ht.patient_id = ?')
    params.push(Number(filters.patient_id))
  }
  if (filters?.search?.trim()) {
    const q = `%${filters.search.trim()}%`
    clauses.push('(ht.test_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR ht.notes LIKE ?)')
    params.push(q, q, q, q)
  }
  if (isDemoDataHidden()) {
    clauses.push('ht.is_demo = 0')
  }

  const rows = db
    .prepare(
      `SELECT ht.*,
              c.name as patient_name,
              c.phone as patient_phone,
              c.birth_date as patient_birth_date,
              c.gender as patient_gender
       FROM hearing_tests ht
       LEFT JOIN customers c ON c.id = ht.patient_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY ht.test_date DESC, ht.id DESC`
    )
    .all(...params) as Record<string, unknown>[]

  return rows.map(normalizeHearingTestRow)
}

export function saveHearingTest(
  data: Partial<HearingTest> & { points?: AudiogramPoint[] }
): HearingTest {
  return runTransaction(() => {
    if (!data.patient_id) throw new Error('يجب تحديد المريض لحفظ فحص السمع')
    const pts = Array.isArray(data.points) ? data.points : []
    const autoCalc = calculatePtaAndSuggestLoss(pts)

    const ptaRight =
      data.pta_right !== undefined && data.pta_right !== null
        ? Number(data.pta_right)
        : autoCalc.pta_right
    const ptaLeft =
      data.pta_left !== undefined && data.pta_left !== null
        ? Number(data.pta_left)
        : autoCalc.pta_left
    const lossDegreeRight = data.loss_degree_right?.trim() || autoCalc.loss_degree_right
    const lossDegreeLeft = data.loss_degree_left?.trim() || autoCalc.loss_degree_left
    const lossTypeRight = data.loss_type_right?.trim() || autoCalc.loss_type_right
    const lossTypeLeft = data.loss_type_left?.trim() || autoCalc.loss_type_left

    let examinerName = data.examiner_name?.trim() || ''
    if (data.examiner_id && !examinerName) {
      const tech = db
        .prepare('SELECT name FROM technicians WHERE id = ?')
        .get(data.examiner_id) as { name: string } | undefined
      if (tech) examinerName = tech.name
    }

    let recProdName = data.recommended_product_name?.trim() || ''
    if (data.recommended_product_id && !recProdName) {
      const prod = db
        .prepare('SELECT name, brand, model FROM products WHERE id = ?')
        .get(data.recommended_product_id) as { name: string; brand: string; model: string } | undefined
      if (prod) recProdName = `${prod.name} (${prod.brand} ${prod.model})`.trim()
    }

    let testId = Number(data.id || 0)
    if (testId > 0) {
      db.prepare(
        `UPDATE hearing_tests SET
          test_date = ?, examiner_id = ?, examiner_name = ?, test_type = ?,
          srt_right = ?, srt_left = ?, sds_right = ?, sds_left = ?,
          mcl_right = ?, mcl_left = ?, ucl_right = ?, ucl_left = ?,
          tymp_right = ?, tymp_left = ?,
          pta_right = ?, pta_left = ?,
          loss_type_right = ?, loss_type_left = ?,
          loss_degree_right = ?, loss_degree_left = ?,
          recommended_product_id = ?, recommended_product_name = ?,
          recommendation_notes = ?, notes = ?
         WHERE id = ?`
      ).run(
        data.test_date || getLocalDateString(),
        data.examiner_id || null,
        examinerName,
        data.test_type || 'pure_tone',
        data.srt_right !== undefined && data.srt_right !== null && String(data.srt_right) !== ''
          ? Number(data.srt_right)
          : null,
        data.srt_left !== undefined && data.srt_left !== null && String(data.srt_left) !== ''
          ? Number(data.srt_left)
          : null,
        data.sds_right !== undefined && data.sds_right !== null && String(data.sds_right) !== ''
          ? Number(data.sds_right)
          : null,
        data.sds_left !== undefined && data.sds_left !== null && String(data.sds_left) !== ''
          ? Number(data.sds_left)
          : null,
        data.mcl_right !== undefined && data.mcl_right !== null && String(data.mcl_right) !== ''
          ? Number(data.mcl_right)
          : null,
        data.mcl_left !== undefined && data.mcl_left !== null && String(data.mcl_left) !== ''
          ? Number(data.mcl_left)
          : null,
        data.ucl_right !== undefined && data.ucl_right !== null && String(data.ucl_right) !== ''
          ? Number(data.ucl_right)
          : null,
        data.ucl_left !== undefined && data.ucl_left !== null && String(data.ucl_left) !== ''
          ? Number(data.ucl_left)
          : null,
        data.tymp_right?.trim() || '',
        data.tymp_left?.trim() || '',
        ptaRight,
        ptaLeft,
        lossTypeRight,
        lossTypeLeft,
        lossDegreeRight,
        lossDegreeLeft,
        data.recommended_product_id || null,
        recProdName,
        data.recommendation_notes?.trim() || '',
        data.notes?.trim() || '',
        testId
      )
    } else {
      const testNumber = data.test_number?.trim() || generateNextTestNumber()
      const info = db
        .prepare(
          `INSERT INTO hearing_tests (
            test_number, patient_id, test_date, examiner_id, examiner_name, test_type,
            srt_right, srt_left, sds_right, sds_left,
            mcl_right, mcl_left, ucl_right, ucl_left,
            tymp_right, tymp_left,
            pta_right, pta_left,
            loss_type_right, loss_type_left,
            loss_degree_right, loss_degree_left,
            recommended_product_id, recommended_product_name,
            recommendation_notes, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          testNumber,
          Number(data.patient_id),
          data.test_date || getLocalDateString(),
          data.examiner_id || null,
          examinerName,
          data.test_type || 'pure_tone',
          data.srt_right !== undefined && data.srt_right !== null && String(data.srt_right) !== ''
            ? Number(data.srt_right)
            : null,
          data.srt_left !== undefined && data.srt_left !== null && String(data.srt_left) !== ''
            ? Number(data.srt_left)
            : null,
          data.sds_right !== undefined && data.sds_right !== null && String(data.sds_right) !== ''
            ? Number(data.sds_right)
            : null,
          data.sds_left !== undefined && data.sds_left !== null && String(data.sds_left) !== ''
            ? Number(data.sds_left)
            : null,
          data.mcl_right !== undefined && data.mcl_right !== null && String(data.mcl_right) !== ''
            ? Number(data.mcl_right)
            : null,
          data.mcl_left !== undefined && data.mcl_left !== null && String(data.mcl_left) !== ''
            ? Number(data.mcl_left)
            : null,
          data.ucl_right !== undefined && data.ucl_right !== null && String(data.ucl_right) !== ''
            ? Number(data.ucl_right)
            : null,
          data.ucl_left !== undefined && data.ucl_left !== null && String(data.ucl_left) !== ''
            ? Number(data.ucl_left)
            : null,
          data.tymp_right?.trim() || '',
          data.tymp_left?.trim() || '',
          ptaRight,
          ptaLeft,
          lossTypeRight,
          lossTypeLeft,
          lossDegreeRight,
          lossDegreeLeft,
          data.recommended_product_id || null,
          recProdName,
          data.recommendation_notes?.trim() || '',
          data.notes?.trim() || ''
        )
      testId = Number(info.lastInsertRowid)
    }

    // Replace audiogram_points
    db.prepare('DELETE FROM audiogram_points WHERE test_id = ?').run(testId)
    const insertPoint = db.prepare(
      `INSERT OR REPLACE INTO audiogram_points (
        test_id, ear, conduction, frequency, db_value, is_masked, no_response
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )

    for (const pt of pts) {
      if (pt.db_value === undefined || pt.db_value === null || Number.isNaN(Number(pt.db_value))) {
        continue
      }
      const clampedDb = Math.max(-10, Math.min(120, Number(pt.db_value)))
      insertPoint.run(
        testId,
        pt.ear === 'left' ? 'left' : 'right',
        pt.conduction === 'bone' ? 'bone' : 'air',
        Number(pt.frequency),
        clampedDb,
        pt.is_masked ? 1 : 0,
        pt.no_response ? 1 : 0
      )
    }

    return listHearingTests({ patient_id: Number(data.patient_id) }).find((t) => t.id === testId)!
  })
}

export function deleteHearingTest(id: number): void {
  db.prepare('DELETE FROM hearing_tests WHERE id = ?').run(id)
}

export function getLatestHearingTestSummary(patientId: number): {
  latestTest: HearingTest | null
  allTests: HearingTest[]
  testsCount: number
  implantsCount: number
  latestFollowup: FollowupItem | null
  allergies: string
  medicalComplaint: string
} {
  const tests = listHearingTests({ patient_id: patientId })
  const cust = db
    .prepare('SELECT allergies, medical_complaint FROM customers WHERE id = ?')
    .get(patientId) as { allergies?: string; medical_complaint?: string } | undefined
  const implantsCnt = (
    db
      .prepare('SELECT COUNT(*) as cnt FROM implants WHERE patient_id = ?')
      .get(patientId) as { cnt: number }
  ).cnt
  const followups = listFollowups({ patient_id: patientId })

  return {
    latestTest: tests[0] || null,
    allTests: tests.slice(0, 5),
    testsCount: tests.length,
    implantsCount: implantsCnt || 0,
    latestFollowup: followups[0] || null,
    allergies: cust?.allergies || '',
    medicalComplaint: cust?.medical_complaint || ''
  }
}

// ==========================================
// FOLLOW-UPS & FITTING SESSIONS (4.3)
// ==========================================
