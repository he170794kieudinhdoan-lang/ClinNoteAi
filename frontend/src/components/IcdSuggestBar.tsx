"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as HoverCard from "@radix-ui/react-hover-card";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { lookupIcd, searchIcdRemote, type IcdDetail } from "@/lib/api";
import { ICD_CODE, searchIcd } from "@/lib/icdCatalog";
import type { IcdSuggestion } from "@/types";

export default function IcdSuggestBar({
  suggestions,
  selectedIcd,
  locked,
  onSelect,
  onSuggestions,
}: {
  suggestions: IcdSuggestion[];
  selectedIcd?: string;
  locked?: boolean;
  onSelect: (code: string) => void;
  onSuggestions: (items: IcdSuggestion[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<IcdSuggestion[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const selected = suggestions.some((item) => item.code === selectedIcd) ? selectedIcd : suggestions[0]?.code;
  const results = remote ?? searchIcd(query, suggestions);
  const typed = query.trim().toUpperCase();
  const manual = ICD_CODE.test(typed) && !results.some((item) => item.code === typed);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setRemote(null);
      setSearchError("");
      setSearching(false);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setSearchError("");
      searchIcdRemote(q)
        .then((rows) => {
          if (alive) setRemote(rows);
        })
        .catch((error: unknown) => {
          if (!alive) return;
          setRemote(null);
          setSearchError(error instanceof Error ? error.message : "Không tra được ICD.");
        })
        .finally(() => {
          if (alive) setSearching(false);
        });
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  function choose(item: IcdSuggestion) {
    onSelect(item.code);
    if (!suggestions.some((current) => current.code === item.code)) onSuggestions([...suggestions, item]);
    setQuery("");
    setRemote(null);
    setOpen(false);
  }

  return (
    <div className="border-t border-line bg-white px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-bold">Gợi ý ICD-10</h3>
        <p className="text-[11px] text-muted">Rê chuột để xem phân loại KCB</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {suggestions.map((item) => {
          const on = item.code === selected;
          return (
            <HoverCard.Root key={item.code} openDelay={180} closeDelay={80}>
              <HoverCard.Trigger asChild>
                <button
                  type="button"
                  onClick={() => onSelect(item.code)}
                  disabled={locked}
                  className={`inline-flex h-8 max-w-full items-center gap-2 rounded-lg border px-2 text-[12px] ${
                    on ? "border-[#16845B] bg-[#eef7f2] font-semibold" : "border-line bg-white hover:bg-subtle"
                  }`}
                >
                  <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] ring-1 ring-line">{item.code}</span>
                  <span className="max-w-48 truncate">{item.title}</span>
                </button>
              </HoverCard.Trigger>
              <HoverCard.Portal>
                <HoverCard.Content side="top" sideOffset={8} collisionPadding={12} className="z-50 w-80 rounded-2xl border border-line bg-white p-3 text-ink shadow-panel">
                  <IcdHover code={item.code} title={item.title} />
                </HoverCard.Content>
              </HoverCard.Portal>
            </HoverCard.Root>
          );
        })}
        {!locked && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-line bg-white px-2.5 text-[12px] text-muted hover:bg-subtle"
          >
            <Search size={13} /> Tìm mã
          </button>
        )}
      </div>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/20" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[min(32rem,calc(100dvh-4rem))] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[22px] border border-line bg-subtle text-ink shadow-[0_16px_40px_rgba(62,52,44,0.12)]">
            <header className="flex items-center justify-between px-4 py-3">
              <Dialog.Title className="font-serif text-lg font-bold">Tìm mã ICD-10</Dialog.Title>
              <Dialog.Close aria-label="Đóng" className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white text-sm hover:bg-subtle">
                ✕
              </Dialog.Close>
            </header>
            <Command shouldFilter={false} className="flex min-h-0 flex-1 flex-col px-4 pb-3">
              <Command.Input
                value={query}
                onValueChange={setQuery}
                aria-label="Tìm mã hoặc tên bệnh"
                placeholder="Mã hoặc tên bệnh, ví dụ khớp gối"
                className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none"
              />
              <Command.List className="mt-3 min-h-0 flex-1 overflow-y-auto">
                {query.trim() === "" && <p className="px-2 pb-1 text-[11px] text-faint">Gợi ý cho lượt khám này</p>}
                {searching && <p className="px-2 py-2 text-[11px] text-muted">Đang tra danh mục KCB…</p>}
                {searchError && <p className="px-2 py-2 text-[11px] text-danger">{searchError}</p>}
                {results.map((item) => (
                  <Command.Item
                    key={item.code}
                    value={`${item.code} ${item.title}`}
                    onSelect={() => choose(item)}
                    className="flex cursor-pointer items-baseline gap-2 rounded-lg px-2 py-2 text-left text-sm data-[selected=true]:bg-white"
                  >
                    <span className="w-16 shrink-0 font-mono text-xs font-semibold">{item.code}</span>
                    <span>{item.title}</span>
                  </Command.Item>
                ))}
                {manual && (
                  <Command.Item
                    value={typed}
                    onSelect={() => choose({ code: typed, title: "Mã nhập tay" })}
                    className="flex cursor-pointer items-baseline gap-2 rounded-lg px-2 py-2 text-left text-sm data-[selected=true]:bg-white"
                  >
                    <span className="w-16 shrink-0 font-mono text-xs font-semibold">{typed}</span>
                    <span>Dùng mã này</span>
                  </Command.Item>
                )}
                <Command.Empty className="px-2 py-6 text-center text-sm text-faint">Không thấy mã phù hợp</Command.Empty>
              </Command.List>
            </Command>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function IcdHover({ code, title }: { code: string; title: string }) {
  const [detail, setDetail] = useState<IcdDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    lookupIcd(code)
      .then((next) => {
        if (alive) setDetail(next);
      })
      .catch((cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause.message : "Không tải được mã.");
      });
    return () => {
      alive = false;
    };
  }, [code]);

  return (
    <div>
      <p className="font-mono text-[11px] font-bold text-muted">{detail?.icd10_code ?? code}</p>
      <p className="mt-1 text-sm font-semibold leading-snug">{detail?.disease_name_vi || title}</p>
      {detail?.description_vi && <p className="mt-1 text-[12px] leading-snug text-muted">{detail.description_vi}</p>}
      {detail && (
        <dl className="mt-2 space-y-1 border-t border-line-soft pt-2 text-[11px] leading-snug text-muted">
          <div><dt className="inline font-semibold text-ink">Chương {detail.chapter.code}. </dt><dd className="inline">{detail.chapter.title}</dd></div>
          <div><dt className="inline font-semibold text-ink">{detail.section.code}. </dt><dd className="inline">{detail.section.title}</dd></div>
          <div><dt className="inline font-semibold text-ink">{detail.parent_group.code}. </dt><dd className="inline">{detail.parent_group.title}</dd></div>
        </dl>
      )}
      {!detail && !error && <p className="mt-2 text-[11px] text-muted">Đang tải phân loại…</p>}
      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
    </div>
  );
}
