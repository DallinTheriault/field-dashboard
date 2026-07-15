"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ImagePlus,
  Loader2,
  Plus,
  Square,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/photos/compress";
import { deleteTask, deleteTaskPhoto } from "../task-actions";

export type TaskPhoto = { id: number; caption: string | null };
export type JobTask = {
  id: number;
  title: string;
  note: string | null;
  status: "open" | "done";
  sort_order: number;
  photos: TaskPhoto[];
  /** Estimate lines linked to this task — warn before deleting. */
  linkedLines: number;
};

/**
 * The job's task list — one list, three lives: scoping notes during the
 * walkthrough, per-line traceability for estimates, punch list during the
 * work. Internal only; nothing here reaches a client-facing view.
 */
export function JobTasks({
  jobId,
  clientId,
  tasks,
  canWrite,
}: {
  jobId: number;
  clientId: number;
  tasks: JobTask[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status === "done");

  async function refresh() {
    router.refresh();
  }

  async function addTask() {
    setErr(null);
    if (!title.trim()) return setErr("Give the task a title.");
    setBusy("add");
    const maxSort = tasks.reduce((m, t) => Math.max(m, t.sort_order), 0);
    const { error } = await supabase.from("tasks").insert({
      client_id: clientId,
      job_id: jobId,
      title: title.trim(),
      note: note.trim() || null,
      sort_order: maxSort + 1,
    });
    setBusy(null);
    if (error) return setErr(error.message);
    setTitle("");
    setNote("");
    refresh();
  }

  async function toggle(t: JobTask) {
    setErr(null);
    const { error } = await supabase
      .from("tasks")
      .update({
        status: t.status === "open" ? "done" : "open",
        updated_at: new Date().toISOString(),
      })
      .eq("id", t.id);
    if (error) setErr(error.message);
    else refresh();
  }

  /** Swap sort_order with the neighbor within the same status group. */
  async function move(t: JobTask, dir: -1 | 1) {
    const group = t.status === "open" ? open : done;
    const idx = group.findIndex((x) => x.id === t.id);
    const other = group[idx + dir];
    if (!other) return;
    setErr(null);
    const stamp = new Date().toISOString();
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase
        .from("tasks")
        .update({ sort_order: other.sort_order, updated_at: stamp })
        .eq("id", t.id),
      supabase
        .from("tasks")
        .update({ sort_order: t.sort_order, updated_at: stamp })
        .eq("id", other.id),
    ]);
    if (e1 || e2) setErr((e1 ?? e2)!.message);
    else refresh();
  }

  async function remove(t: JobTask) {
    const linked =
      t.linkedLines > 0
        ? `\n\n${t.linkedLines} estimate line${t.linkedLines === 1 ? "" : "s"} link${t.linkedLines === 1 ? "s" : ""} to it — the lines and their pricing stay, only the link is cleared.`
        : "";
    if (!confirm(`Delete "${t.title}"?${t.photos.length > 0 ? ` Its ${t.photos.length} photo${t.photos.length === 1 ? "" : "s"} will be deleted too.` : ""}${linked}`)) {
      return;
    }
    setErr(null);
    setBusy(`del-${t.id}`);
    const r = await deleteTask(t.id);
    setBusy(null);
    if (!r.ok) setErr(r.error);
    else refresh();
  }

  return (
    <div className="panel px-4 py-3 mb-5">
      <div className="label-eyebrow mb-2">
        Tasks
        {tasks.length > 0 && (
          <span className="ml-1.5 normal-case tracking-normal font-normal">
            · {open.length} open
          </span>
        )}
      </div>

      {canWrite && (
        <div className="space-y-1.5 mb-3">
          <div className="flex gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addTask();
              }}
              placeholder="Add a task (e.g. Fix dishwasher latch)"
              className="flex-1 min-w-0"
            />
            <button
              type="button"
              onClick={addTask}
              disabled={busy === "add"}
              className="btn-primary shrink-0 min-h-[42px]"
            >
              {busy === "add" ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Plus size={13} />
              )}
              Add
            </button>
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="w-full text-sm"
          />
        </div>
      )}
      {err && <div className="form-error mb-2">{err}</div>}

      {tasks.length === 0 ? (
        <p className="text-2xs text-bone-400">
          Walk the property, capture every item the customer mentions — one
          task each, photos welcome. This list becomes the punch list.
        </p>
      ) : (
        <ul className="space-y-1">
          {[...open, ...done].map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              expanded={openId === t.id}
              onToggleExpand={() => setOpenId(openId === t.id ? null : t.id)}
              onToggleStatus={() => toggle(t)}
              onMove={(dir) => move(t, dir)}
              onDelete={() => remove(t)}
              busy={busy === `del-${t.id}`}
              canWrite={canWrite}
              onChanged={refresh}
              onError={setErr}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskRow({
  task,
  expanded,
  onToggleExpand,
  onToggleStatus,
  onMove,
  onDelete,
  busy,
  canWrite,
  onChanged,
  onError,
}: {
  task: JobTask;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleStatus: () => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  busy: boolean;
  canWrite: boolean;
  onChanged: () => void;
  onError: (m: string | null) => void;
}) {
  const supabase = createClient();
  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const isDone = task.status === "done";

  async function saveDetails() {
    onError(null);
    if (!title.trim()) return onError("Title can't be empty.");
    setSaving(true);
    const { error } = await supabase
      .from("tasks")
      .update({
        title: title.trim(),
        note: note.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id);
    setSaving(false);
    if (error) onError(error.message);
    else onChanged();
  }

  async function uploadPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    onError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const compressed = await compressImage(file);
        const fd = new FormData();
        fd.append(
          "photo",
          new File([compressed], "photo.jpg", {
            type: compressed.type || "image/jpeg",
          }),
        );
        const res = await fetch(`/api/tasks/${task.id}/photos`, {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Photo upload failed.");
        }
      }
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Photo upload failed.");
    } finally {
      setUploading(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (libraryRef.current) libraryRef.current.value = "";
    }
  }

  async function saveCaption(photoId: number, caption: string) {
    const { error } = await supabase
      .from("task_photos")
      .update({ caption: caption.trim() || null })
      .eq("id", photoId);
    if (error) onError(error.message);
  }

  async function removePhoto(photoId: number) {
    if (!confirm("Delete this photo?")) return;
    onError(null);
    const r = await deleteTaskPhoto(photoId);
    if (!r.ok) onError(r.error);
    else onChanged();
  }

  return (
    <li
      className={`bg-ink-2 rounded-sm shadow-inset-line ${isDone ? "opacity-55" : ""}`}
    >
      <div className="flex items-center gap-2 px-2.5 py-2">
        <button
          type="button"
          onClick={onToggleStatus}
          disabled={!canWrite}
          className={`shrink-0 p-1 ${isDone ? "text-status-completed" : "text-bone-400 hover:text-bone-100"}`}
          aria-label={isDone ? "Mark open" : "Mark done"}
        >
          {isDone ? <Check size={15} /> : <Square size={15} />}
        </button>
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
        >
          <span
            className={`text-sm truncate ${isDone ? "line-through text-bone-400" : "text-bone-100"}`}
          >
            {task.title}
          </span>
          {task.photos.length > 0 && (
            <span className="chip normal-case tracking-normal border-line-strong text-bone-400 shrink-0">
              <Camera size={9} />
              {task.photos.length}
            </span>
          )}
          {expanded ? (
            <ChevronDown size={13} className="text-bone-500 ml-auto shrink-0" />
          ) : (
            <ChevronRight size={13} className="text-bone-500 ml-auto shrink-0" />
          )}
        </button>
        {canWrite && (
          <span className="flex flex-col shrink-0 -my-1">
            <button
              type="button"
              onClick={() => onMove(-1)}
              className="text-bone-500 hover:text-bone-200 p-0.5"
              aria-label="Move up"
            >
              <ChevronUp size={12} />
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              className="text-bone-500 hover:text-bone-200 p-0.5"
              aria-label="Move down"
            >
              <ChevronDown size={12} />
            </button>
          </span>
        )}
      </div>

      {expanded && (
        <div className="px-2.5 pb-2.5 space-y-2 border-t border-line-subtle pt-2">
          {canWrite ? (
            <>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-sm"
                aria-label="Task title"
              />
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note — what exactly, where, customer preference…"
                rows={2}
                className="w-full text-sm"
              />
            </>
          ) : (
            task.note && <p className="text-sm text-bone-300">{task.note}</p>
          )}

          {task.photos.length > 0 && (
            <ul className="grid grid-cols-3 gap-2">
              {task.photos.map((p) => (
                <li key={p.id} className="space-y-1">
                  <div className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/task-photos/${p.id}`}
                      alt={p.caption ?? task.title}
                      loading="lazy"
                      className="w-full aspect-square object-cover rounded-sm border border-line"
                    />
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => removePhoto(p.id)}
                        className="absolute top-1 right-1 bg-ink-1/80 rounded-sm p-1 text-bone-300 hover:text-status-danger"
                        aria-label="Delete photo"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                  {canWrite ? (
                    <input
                      defaultValue={p.caption ?? ""}
                      onBlur={(e) => saveCaption(p.id, e.target.value)}
                      placeholder="Caption"
                      className="w-full !text-2xs !py-1"
                    />
                  ) : (
                    p.caption && (
                      <p className="text-2xs text-bone-400">{p.caption}</p>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}

          {canWrite && (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => uploadPhotos(e.target.files)}
              />
              <input
                ref={libraryRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => uploadPhotos(e.target.files)}
              />
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={uploading}
                className="btn-secondary text-xs h-8"
              >
                {uploading ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Camera size={11} />
                )}
                Camera
              </button>
              <button
                type="button"
                onClick={() => libraryRef.current?.click()}
                disabled={uploading}
                className="btn-secondary text-xs h-8"
              >
                <ImagePlus size={11} />
                Library
              </button>
              <button
                type="button"
                onClick={saveDetails}
                disabled={saving}
                className="btn-secondary text-xs h-8"
              >
                {saving ? <Loader2 size={11} className="animate-spin" /> : "Save"}
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                className="btn-ghost text-xs h-8 text-bone-500 hover:text-status-danger ml-auto"
              >
                {busy ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Trash2 size={11} />
                )}
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
