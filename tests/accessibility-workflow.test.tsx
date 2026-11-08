// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WysiwygField from '@/components/input/wysiwyg-field';
import { readFileSync } from 'node:fs';
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('Tab exits the notes editor; formatting controls have names, state and keyboard activation', async () => {
  Object.defineProperty(document,'queryCommandState',{configurable:true,value:vi.fn(()=>false)});
  Object.defineProperty(document,'execCommand',{configurable:true,value:vi.fn(()=>true)});
  const user = userEvent.setup();
  render(<><WysiwygField label="Notes" icon={null} iconBg="white" iconFg="black" labelColor="black" placeholder="Summary" htmlValue="<p>Undecided</p>" onChange={()=>{}} /><button>Next action</button></>);
  const bold = screen.getByRole('button',{name:'Notes: Bold'});
  await user.tab(); expect(document.activeElement).toBe(bold);
  await user.keyboard('{Enter}');
  expect(document.execCommand).toHaveBeenCalledWith('bold');
  expect(document.activeElement).toBe(screen.getByRole('textbox',{name:'Notes'}));
  await user.tab(); expect(document.activeElement).toBe(screen.getByRole('button',{name:'Next action'}));
  expect(bold.getAttribute('aria-pressed')).toBe('false');
});
it('workflow text tokens meet 4.5:1 against white and the cream page background', () => {
  const css = readFileSync('src/app/globals.css','utf8');
  const luminance = (hex: string) => {
    const rgb = hex.match(/[0-9a-f]{2}/gi)!.map(v => parseInt(v,16)/255).map(v => v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
    return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
  };
  for (const token of ['forest','muted-text','sage','ochre','amber','red-soft']) {
    const color = new RegExp(`--color-${token}:\\s*(#[0-9a-fA-F]{6})`).exec(css)![1];
    for (const background of ['#ffffff','#F2EFE8']) expect((luminance(background)+0.05)/(luminance(color)+0.05), token).toBeGreaterThanOrEqual(4.5);
  }
});
