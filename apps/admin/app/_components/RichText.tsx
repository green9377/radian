"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { uploadImage } from "../_data/api";

/*
  A small writing box with formatting — for the journal.

  The first version of the journal screen gave the owner a bare <textarea> and
  a note saying "a proper editor comes later". He asked, reasonably, where he
  was supposed to actually write an article. A raw box in which bold, headings
  and links are impossible is not somewhere anybody writes.

  ⚠️ NO EDITOR LIBRARY. TipTap or Quill would be better at the edges — but they
  are a large dependency carried by the whole admin bundle for one screen. This
  is `contentEditable` plus `document.execCommand`, which is deprecated and
  still implemented by every browser in use, and covers what a shop's articles
  need: paragraphs, headings, bold, italic, lists, links, pictures.

  ⚠️ WHY IT IS UNCONTROLLED. Writing `value` back into a contentEditable on
  every keystroke moves the caret to the end of the text — the classic bug that
  makes an editor unusable after the second sentence. The initial HTML is set
  once; the parent is told on blur.
*/

export default function RichText({
  value,
  onChange,
  placeholder = "Write the article…",
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  /** why the last thing was refused — on the page, never in a browser alert */
  const [err, setErr] = useState("");
  const [empty, setEmpty] = useState(!value);

  // set once per article, never on every render — see the note above
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = value || "";
    setEmpty(!value);
  }, [value]);

  const cmd = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    push();
  };

  const push = () => {
    const html = ref.current?.innerHTML ?? "";
    setEmpty(!html || html === "<br>");
    onChange(html);
  };

  async function insertImage(file: File) {
    setUploading(true);
    try {
      const { url } = await uploadImage(file, "brand");
      // execCommand inserts at the caret, which is where the writer expects it
      cmd("insertHTML", `<img src="${url}" alt="" style="max-width:100%;border-radius:12px;margin:12px 0" />`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add that picture.");
    } finally {
      setUploading(false);
    }
  }

  /*  ⚠️ The address is typed IN THE TOOLBAR, not in a `prompt()`. A prompt
      blocks the page, loses what was typed on Escape, and — the part that
      matters for a link — puts the address somewhere it cannot be read back
      before it is committed to the text.  */
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  function addLink() { setLinkUrl(""); }
  function commitLink() {
    const url = (linkUrl ?? "").trim();
    setLinkUrl(null);
    if (!url) return;
    cmd("createLink", url);
  }

  const btn = "px-2.5 py-1.5 rounded-[8px] text-[13px] text-body hover:bg-lavender hover:text-purple transition-colors";

  return (
    <div className="border-[1.5px] border-lavender-deep rounded-[12px] overflow-hidden bg-white focus-within:border-orchid">
      <div className="flex items-center gap-0.5 flex-wrap px-2 py-1.5 border-b border-lavender-deep bg-lavender/30">
        <button onClick={() => cmd("formatBlock", "<h2>")} className={btn} title="Section heading">Heading</button>
        <button onClick={() => cmd("formatBlock", "<p>")} className={btn} title="Normal text">Text</button>
        <span className="w-px h-4 bg-lavender-deep mx-1" />
        <button onClick={() => cmd("bold")} className={`${btn} font-bold`} title="Bold">B</button>
        <button onClick={() => cmd("italic")} className={`${btn} italic`} title="Italic">I</button>
        <span className="w-px h-4 bg-lavender-deep mx-1" />
        <button onClick={() => cmd("insertUnorderedList")} className={btn} title="Bullet list">• List</button>
        <button onClick={addLink} className={btn} title="Add a link">Link</button>
        <span className="w-px h-4 bg-lavender-deep mx-1" />
        <label className={`${btn} cursor-pointer inline-flex items-center gap-1.5`} title="Add a picture">
          <Icon name="photo" size={13} /> {uploading ? "Adding…" : "Picture"}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void insertImage(f); e.target.value = ""; }} />
        </label>
        <span className="flex-1" />
        <button onClick={() => cmd("removeFormat")} className={btn} title="Clear formatting">Clear</button>
      </div>
      {linkUrl !== null && (
        <div className="flex items-center gap-2 px-2 py-2 border-b border-lavender-deep bg-white">
          <input
            autoFocus
            className="ipt h-[34px] flex-1"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitLink(); } if (e.key === "Escape") setLinkUrl(null); }}
            placeholder="A page on the site (/faq) or a full address (https://…)"
          />
          <button type="button" onClick={commitLink} className="text-[13px] font-bold text-purple px-3 py-1.5">Link it</button>
          <button type="button" onClick={() => setLinkUrl(null)} className="text-[13px] text-body-soft px-2">Cancel</button>
        </div>
      )}
      {err && (
        <div className="flex items-start gap-2 px-3 py-2 border-b text-[12.5px]" style={{ background: "#fdeef0", borderColor: "#f3c9cf", color: "#8c2f39" }}>
          <span className="flex-1">{err}</span>
          <button type="button" onClick={() => setErr("")} className="font-bold opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="relative">
        {empty && (
          <span className="absolute left-4 top-4 text-[14px] text-body-soft pointer-events-none">{placeholder}</span>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={() => setEmpty(!ref.current?.innerHTML)}
          onBlur={push}
          /*
            Pasting from Word or a browser carries fonts, colours and background
            styles that would override the site's typography wherever the
            article appears. Stripped to plain text, then the writer formats it
            here with the buttons above.
          */
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
          }}
          className="min-h-[280px] px-4 py-3.5 text-[14.5px] leading-[1.75] text-ink outline-none
            [&_h2]:font-display [&_h2]:text-[19px] [&_h2]:text-purple [&_h2]:mt-4 [&_h2]:mb-1.5
            [&_p]:mb-2.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2.5
            [&_a]:text-orchid [&_a]:underline [&_img]:rounded-[12px]"
        />
      </div>
    </div>
  );
}
