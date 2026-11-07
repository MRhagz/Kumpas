import { test, expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function tabTo(page: Page, target: Locator) {
  const trail: string[] = [];
  const reverse = await target.evaluate(e => !!(e.compareDocumentPosition(document.activeElement!) & Node.DOCUMENT_POSITION_FOLLOWING));
  for (let i = 0; i < 180; i++) {
    if (await target.evaluate(e => e === document.activeElement)) return;
    if (i < 45) trail.push(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.slice(0,30) || 'none'));
    await page.keyboard.press(reverse ? 'Shift+Tab' : 'Tab');
  }
  throw new Error('Control cannot be reached by keyboard: '+ await target.getAttribute('aria-label') + ' '+ await target.textContent() + JSON.stringify(trail));
}
for (const width of [375, 1280]) test(`keyboard workflow and WCAG 2.1 AA at ${width}px`, async ({page, browser}, info) => {
  page.on("pageerror", error => console.log("FIXTURE_ERROR", error.message));
  console.log(`${info.project.name}: ${browser.version()} viewport=${width}`);
  await page.setViewportSize({width, height: 900});
  let approved = false, reviewed = false, reportReady = false;
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()).pathname;
    if (url.endsWith('/approve')) approved = true;
    if (url.endsWith('/review')) reviewed = true;
    if (url === '/api/reports') reportReady = true;
    const body = url.endsWith('/intake') ? { profileVersion: 0, documents: [], notes: {careerGoal:'<p>Undecided</p>', interests:'<p>Mathematics</p>', financial:'', concerns:'', impression:'', revision:0, source:null}, uploadPending:false }
      : url.endsWith('/analyze') ? {runId:'run',agentStatuses:[],rankedRecommendations:{recommendations:[]}}
      : url === '/api/reports' ? {sessionId:'fixture',runId:'run',approvedProfileVersion:1,reportVersion:1,reviewStatus:reviewed?'approved':'draft',downloadUrl:reviewed?'/approved.pdf':null,previewUrl:'/preview.pdf',generatedAt:'2026-11-07T00:00:00Z',expiresAt:'2099-01-02T00:00:00Z',recommendations:[{id:'one',rank:1,careerPath:'Mathematics and public engineering pathways with a deliberately long career label',alignmentScore:80,keySignals:[],keySignalDetails:[],reasoningSummary:'Discuss available routes and missing evidence with your counselor. '+ 'Explanation '.repeat(30)}],recommendationCount:1,academicEvidence:{availableDocuments:[],missingDocuments:['form137','ncae','nat'],completenessNote:'Academic evidence unavailable.'}}
      : {sessionId:'fixture',currentRunId:approved?'run':null,profileVersion:approved?1:0,currentReportVersion:reportReady?1:0,reportReviewStatus:reportReady?(reviewed?'approved':'draft'):null,hasApprovedProfile:approved,hasReport:reportReady,nextStep:reportReady?'report':approved?'analysis':'input',expiresAt:'2099-01-01T00:00:00Z',records:[]};
    await route.fulfill({json:body});
  });
  await page.goto('/');
  const goal = page.getByRole('textbox',{name:'Career Goal (required)'});
  await expect(goal).toBeVisible();
  const notice = page.getByRole('checkbox',{name:/I have read this notice/});
  await tabTo(page,notice); await page.keyboard.press('Space');
  await tabTo(page,goal);
  expect(await goal.evaluate(e => getComputedStyle(e).outlineStyle)).not.toBe('none');
  const docType = page.getByRole('combobox',{name:'Document 1 type'});
  await expect(docType).toBeVisible();
  await tabTo(page, docType); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  const upload = page.getByRole('button',{name:'Upload document 1',exact:true});
  await tabTo(page,upload);
  const selecting = page.waitForEvent('filechooser'); await page.keyboard.press('Enter');
  await (await selecting).setFiles({name:'fixture.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic invalid document')});
  await expect(page.getByRole('alert')).toContainText('Choose a JPEG');
  const scan = async (stage: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const result = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
    console.log(`${stage}: violations=${result.violations.length}, needs-review=${result.incomplete.length}`);
    await info.attach(`${stage}-axe`,{body:JSON.stringify(result,null,2),contentType:'application/json'});
    expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
    await page.screenshot({path:info.outputPath(`${stage}.png`),fullPage:true});
  };
  await scan('intake');
  const cancel = page.getByRole('button',{name:'Cancel session',exact:true});
  await tabTo(page,cancel); await page.keyboard.press('Enter');
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(cancel).toBeFocused();
  const checked = page.getByRole('checkbox',{name:/I have reviewed these notes/});
  await tabTo(page,checked); await page.keyboard.press('Space');
  const approve = page.getByRole('button',{name:'Approve Inputs and Begin Analysis'});
  await tabTo(page,approve); await page.keyboard.press('Enter');
  const approveReport = page.getByRole('button',{name:'Approve report v1'});
  await expect(approveReport).toBeVisible(); await scan('review');
  await tabTo(page,approveReport); await page.keyboard.press('Enter');
  await expect(page.getByRole('button',{name:'Download PDF'})).toBeVisible(); await scan('download');
});
