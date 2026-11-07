/**
 * Filter release notes according to the active business activity profile.
 * Supports:
 * - Common tags: [عام] [مشترك] [الكل] [all] [general] [common]
 * - Appliances tags: [الأجهزة] [الأجهزة المنزلية] [صيانة الأجهزة] [صيانة] [appliances] [maintenance]
 * - Hearing aids tags: [السماعات] [السماعات الطبية] [مركز السماعات] [سماعات] [hearing] [hearing_aids]
 */

export function filterReleaseNotes(
  rawNotes: string,
  businessType: 'appliances' | 'hearing_aids'
): string {
  if (!rawNotes || !rawNotes.trim()) return ''

  const lines = rawNotes.split(/\r?\n/)

  const isSectorTag = (text: string) =>
    /(?:\[|#+\s*\[?)(?:الأجهزة|الأجهزة المنزلية|صيانة الأجهزة|السماعات|السماعات الطبية|سماعات|عام|مشترك|الكل|appliances|hearing_aids|hearing|general|common|all)/i.test(
      text
    )

  const hasSectorTags = lines.some((line) => isSectorTag(line))

  // If no sector tags found, return original notes as fallback
  if (!hasSectorTags) {
    return rawNotes
  }

  type SectionType = 'general' | 'appliances' | 'hearing_aids' | 'other'
  let currentSection: SectionType = 'general'
  const filteredLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    // Section headers e.g. "[الأجهزة]" or "### الأجهزة المنزلية" or "[appliances]"
    const appliancesHeader =
      /^\s*(?:#+\s*)?\[?(?:الأجهزة|الأجهزة المنزلية|صيانة الأجهزة|appliances|maintenance)\]?[:\s]*$/i.test(
        trimmed
      ) || /^\s*#+\s*(?:الأجهزة|الأجهزة المنزلية|صيانة الأجهزة)/i.test(trimmed)

    const hearingHeader =
      /^\s*(?:#+\s*)?\[?(?:السماعات|السماعات الطبية|سماعات|hearing|hearing_aids)\]?[:\s]*$/i.test(
        trimmed
      ) || /^\s*#+\s*(?:السماعات|السماعات الطبية|سماعات)/i.test(trimmed)

    const generalHeader =
      /^\s*(?:#+\s*)?\[?(?:عام|مشترك|الكل|تحديثات عامة|general|common|all)\]?[:\s]*$/i.test(
        trimmed
      ) || /^\s*#+\s*(?:عام|تحديثات عامة|مشترك)/i.test(trimmed)

    if (appliancesHeader) {
      currentSection = 'appliances'
      if (businessType === 'appliances') {
        filteredLines.push(line)
      }
      continue
    }

    if (hearingHeader) {
      currentSection = 'hearing_aids'
      if (businessType === 'hearing_aids') {
        filteredLines.push(line)
      }
      continue
    }

    if (generalHeader) {
      currentSection = 'general'
      filteredLines.push(line)
      continue
    }

    // Line-level tags: e.g. "- [الأجهزة] تم إضافة..." or "- [السماعات] تم تحديث..."
    if (/^\s*[-*•]\s*\[(?:الأجهزة|الأجهزة المنزلية|صيانة الأجهزة|appliances|maintenance)\]/i.test(trimmed)) {
      if (businessType === 'appliances') {
        filteredLines.push(
          line.replace(/\[(?:الأجهزة|الأجهزة المنزلية|صيانة الأجهزة|appliances|maintenance)\]\s*/i, '')
        )
      }
      continue
    }

    if (/^\s*[-*•]\s*\[(?:السماعات|السماعات الطبية|سماعات|hearing|hearing_aids)\]/i.test(trimmed)) {
      if (businessType === 'hearing_aids') {
        filteredLines.push(
          line.replace(/\[(?:السماعات|السماعات الطبية|سماعات|hearing|hearing_aids)\]\s*/i, '')
        )
      }
      continue
    }

    if (/^\s*[-*•]\s*\[(?:عام|مشترك|الكل|general|common|all)\]/i.test(trimmed)) {
      filteredLines.push(
        line.replace(/\[(?:عام|مشترك|الكل|general|common|all)\]\s*/i, '')
      )
      continue
    }

    // Regular content under active section
    if (currentSection === 'general') {
      filteredLines.push(line)
    } else if (currentSection === businessType) {
      filteredLines.push(line)
    }
  }

  // Clean up excessive blank lines
  const result = filteredLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return result || rawNotes
}
