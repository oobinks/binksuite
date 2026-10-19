// 📈 Real Excel charts. The Excel library we use can't draw charts, so this adds
// standard chart parts (DrawingML) to the finished .xlsx: a drawing per sheet, a
// chart file per chart, and the links between them. Excel, Google Sheets,
// Numbers and LibreOffice all read these.
import JSZip from "jszip";

export interface ChartSeries {
  name: string;
  /** Cell range of the values, e.g. 'Dashboard'!$F$5:$F$17 */
  ref: string;
  colour: string;
}

export interface ChartSpec {
  /** 1-based position of the sheet in the workbook. */
  sheetIndex: number;
  kind: "doughnut" | "bar" | "line";
  title: string;
  /** Cell range of the category labels. */
  categories: string;
  series: ChartSeries[];
  /** Colours for each slice (doughnut). */
  pointColours?: string[];
  numberFormat: string;
  /** Zero-based cell anchors. */
  from: { col: number; row: number };
  to: { col: number; row: number };
}

const NS_C = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL_DRAWING = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing";
const REL_CHART = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rgb = (hex: string) => hex.replace("#", "").toUpperCase();
const fill = (hex: string) => `<c:spPr><a:solidFill><a:srgbClr val="${rgb(hex)}"/></a:solidFill></c:spPr>`;

function titleXml(text: string) {
  return `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400" b="1"><a:solidFill><a:srgbClr val="3B2F2A"/></a:solidFill></a:defRPr></a:pPr><a:r><a:rPr lang="en-GB" sz="1400" b="1"><a:solidFill><a:srgbClr val="3B2F2A"/></a:solidFill></a:rPr><a:t>${esc(text)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`;
}

function seriesXml(s: ChartSeries, i: number, spec: ChartSpec) {
  const tx = `<c:tx><c:v>${esc(s.name)}</c:v></c:tx>`;
  const cat = `<c:cat><c:strRef><c:f>${esc(spec.categories)}</c:f></c:strRef></c:cat>`;
  const val = `<c:val><c:numRef><c:f>${esc(s.ref)}</c:f></c:numRef></c:val>`;
  if (spec.kind === "doughnut") {
    const points = (spec.pointColours ?? [])
      .map((c, p) => `<c:dPt><c:idx val="${p}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${rgb(c)}"/></a:solidFill><a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`)
      .join("");
    const labels = `<c:dLbls><c:numFmt formatCode="0%" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-GB"/></a:p></c:txPr><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="0"/></c:dLbls>`;
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}${points}${labels}${cat}${val}</c:ser>`;
  }
  if (spec.kind === "bar") return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}${fill(s.colour)}<c:invertIfNegative val="0"/>${cat}${val}</c:ser>`;
  return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}<c:spPr><a:ln w="38100" cap="rnd"><a:solidFill><a:srgbClr val="${rgb(s.colour)}"/></a:solidFill><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="6"/>${fill(s.colour)}</c:marker>${cat}${val}<c:smooth val="1"/></c:ser>`;
}

function axesXml(numberFormat: string) {
  const grid = `<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E7E2DA"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>`;
  const text = `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="7A5C4D"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-GB"/></a:p></c:txPr>`;
  return (
    `<c:catAx><c:axId val="5001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:solidFill><a:srgbClr val="D9D2C7"/></a:solidFill></a:ln></c:spPr>${text}<c:crossAx val="5002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
    `<c:valAx><c:axId val="5002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>${grid}<c:numFmt formatCode="${esc(numberFormat)}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${text}<c:crossAx val="5001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`
  );
}

export function chartXml(spec: ChartSpec): string {
  const series = spec.series.map((s, i) => seriesXml(s, i, spec)).join("");
  let plot: string;
  if (spec.kind === "doughnut") plot = `<c:doughnutChart><c:varyColors val="1"/>${series}<c:firstSliceAng val="0"/><c:holeSize val="58"/></c:doughnutChart>`;
  else if (spec.kind === "bar")
    plot = `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}<c:gapWidth val="70"/><c:overlap val="-10"/><c:axId val="5001"/><c:axId val="5002"/></c:barChart>${axesXml(spec.numberFormat)}`;
  else plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}<c:marker val="1"/><c:axId val="5001"/><c:axId val="5002"/></c:lineChart>${axesXml(spec.numberFormat)}`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:roundedCorners val="0"/><c:chart>${titleXml(spec.title)}<c:plotArea><c:layout/>${plot}</c:plotArea>` +
    `<c:legend><c:legendPos val="${spec.kind === "doughnut" ? "r" : "b"}"/><c:overlay val="0"/><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000"><a:solidFill><a:srgbClr val="3B2F2A"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-GB"/></a:p></c:txPr></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>` +
    `<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="E7E2DA"/></a:solidFill></a:ln></c:spPr></c:chartSpace>`
  );
}

function anchorXml(spec: ChartSpec, n: number, relId: string) {
  return (
    `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${spec.from.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${spec.from.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${spec.to.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${spec.to.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
    `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${n + 1}" name="Chart ${n}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
    `<a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="${relId}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`
  );
}

/** Add charts to a finished .xlsx (from the Excel library) and return the new file. */
export async function addCharts(xlsx: ArrayBuffer, charts: ChartSpec[]): Promise<ArrayBuffer> {
  if (!charts.length) return xlsx;
  const zip = await JSZip.loadAsync(xlsx);
  let types = await zip.file("[Content_Types].xml")!.async("string");
  const bySheet = new Map<number, ChartSpec[]>();
  for (const c of charts) bySheet.set(c.sheetIndex, [...(bySheet.get(c.sheetIndex) ?? []), c]);
  let chartNo = 0;
  let drawingNo = 0;
  for (const [sheetIndex, list] of bySheet) {
    drawingNo++;
    const sheetPath = `xl/worksheets/sheet${sheetIndex}.xml`;
    const sheetXml = await zip.file(sheetPath)?.async("string");
    if (!sheetXml) throw new Error(`Chart sheet ${sheetIndex} is missing from the workbook.`);
    // The drawing: one anchor per chart.
    const anchors: string[] = [];
    const drawingRels: string[] = [];
    list.forEach((c, i) => {
      chartNo++;
      zip.file(`xl/charts/chart${chartNo}.xml`, chartXml(c));
      types = types.replace("</Types>", `<Override PartName="/xl/charts/chart${chartNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`);
      drawingRels.push(`<Relationship Id="rId${i + 1}" Type="${REL_CHART}" Target="../charts/chart${chartNo}.xml"/>`);
      anchors.push(anchorXml(c, chartNo, `rId${i + 1}`));
    });
    zip.file(
      `xl/drawings/drawing${drawingNo}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="${NS_A}">${anchors.join("")}</xdr:wsDr>`,
    );
    zip.file(
      `xl/drawings/_rels/drawing${drawingNo}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawingRels.join("")}</Relationships>`,
    );
    types = types.replace("</Types>", `<Override PartName="/xl/drawings/drawing${drawingNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
    // Link the sheet to its drawing.
    const relsPath = `xl/worksheets/_rels/sheet${sheetIndex}.xml.rels`;
    const existing = await zip.file(relsPath)?.async("string");
    const relId = "rIdBinkChart";
    const rel = `<Relationship Id="${relId}" Type="${REL_DRAWING}" Target="../drawings/drawing${drawingNo}.xml"/>`;
    zip.file(
      relsPath,
      existing
        ? existing.replace("</Relationships>", `${rel}</Relationships>`)
        : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>`,
    );
    let xml = sheetXml;
    const rootStart = xml.indexOf("<worksheet");
    const rootTag = xml.slice(rootStart, xml.indexOf(">", rootStart));
    if (!/\sxmlns:r=/.test(rootTag)) xml = xml.replace("<worksheet", `<worksheet xmlns:r="${NS_R}"`);
    // <drawing> goes straight after the last of the parts that must precede it (page setup,
    // validations, colour rules…). Searching for what comes *after* it isn't safe: colour
    // rules carry their own nested <extLst>.
    const drawing = `<drawing r:id="${relId}"/>`;
    const precede = /<\/conditionalFormatting>|<\/dataValidations>|<\/hyperlinks>|<printOptions[^>]*\/>|<pageMargins[^>]*\/>|<pageSetup[^>]*\/>|<\/headerFooter>|<\/rowBreaks>|<\/colBreaks>|<\/ignoredErrors>|<\/mergeCells>|<\/sheetData>/g;
    let at = -1;
    for (const m of xml.matchAll(precede)) at = Math.max(at, m.index! + m[0].length);
    if (at < 0) at = xml.lastIndexOf("</worksheet>");
    xml = xml.slice(0, at) + drawing + xml.slice(at);
    zip.file(sheetPath, xml);
  }
  zip.file("[Content_Types].xml", types);
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}
