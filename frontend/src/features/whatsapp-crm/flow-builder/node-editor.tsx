"use client";

import { Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { CanvasNode } from "./canvas-types";
import { getNodeMeta } from "./canvas-types";

interface NodeEditorProps {
  node: CanvasNode;
  onUpdate: (nodeId: string, config: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

export function NodeEditor({ node, onUpdate, onDelete, onClose }: NodeEditorProps) {
  const meta = getNodeMeta(node.type);
  const config = node.config;

  const set = (key: string, value: unknown) => {
    onUpdate(node.id, { ...config, [key]: value });
  };

  return (
    <aside className="flex h-full min-h-0 w-72 flex-col border-l border-border/60 bg-white">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base">{meta.icon}</span>
          <span className="text-sm font-bold text-slate-800">{meta.label}</span>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-slate-100">
          <X className="size-4 text-slate-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Message node */}
        {node.type === "message" ? (
          <Field>
            <FieldLabel>Message body</FieldLabel>
            <Textarea
              value={String(config.body ?? "")}
              onChange={(e) => set("body", e.target.value)}
              rows={4}
              placeholder="Type the message to send…"
            />
            <FieldDescription>Supports {"{{variable}}"} placeholders.</FieldDescription>
          </Field>
        ) : null}

        {/* Keyword trigger */}
        {node.type === "keyword_trigger" ? (
          <>
            <Field>
              <FieldLabel>Keywords (comma-separated)</FieldLabel>
              <Input
                value={Array.isArray(config.keywords) ? (config.keywords as string[]).join(", ") : ""}
                onChange={(e) => set("keywords", e.target.value.split(",").map((k) => k.trim()).filter(Boolean))}
                placeholder="pricing, demo, help"
              />
            </Field>
            <Field>
              <FieldLabel>Match type</FieldLabel>
              <NativeSelect value={String(config.matchType ?? "contains")} onChange={(e) => set("matchType", e.target.value)}>
                <option value="exact">Exact match</option>
                <option value="contains">Contains</option>
                <option value="starts_with">Starts with</option>
                <option value="regex">Regex</option>
              </NativeSelect>
            </Field>
          </>
        ) : null}

        {/* Send template */}
        {node.type === "send_template" ? (
          <>
            <Field>
              <FieldLabel>Template name</FieldLabel>
              <Input value={String(config.templateName ?? "")} onChange={(e) => set("templateName", e.target.value)} placeholder="order_confirmation" />
            </Field>
            <Field>
              <FieldLabel>Language</FieldLabel>
              <Input value={String(config.language ?? "en")} onChange={(e) => set("language", e.target.value)} />
            </Field>
          </>
        ) : null}

        {/* Condition */}
        {node.type === "condition" ? (
          <>
            <Field>
              <FieldLabel>Field</FieldLabel>
              <Input value={String(config.field ?? "")} onChange={(e) => set("field", e.target.value)} placeholder="inputs.reply" />
            </Field>
            <Field>
              <FieldLabel>Operator</FieldLabel>
              <NativeSelect value={String(config.operator ?? "equals")} onChange={(e) => set("operator", e.target.value)}>
                <option value="equals">Equals</option>
                <option value="not_equals">Not equals</option>
                <option value="exists">Exists</option>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>Value</FieldLabel>
              <Input value={String(config.value ?? "")} onChange={(e) => set("value", e.target.value)} />
            </Field>
          </>
        ) : null}

        {/* Input / Wait for reply */}
        {node.type === "input" ? (
          <Field>
            <FieldLabel>Capture key</FieldLabel>
            <Input value={String(config.captureKey ?? "")} onChange={(e) => set("captureKey", e.target.value)} placeholder="user_reply" />
            <FieldDescription>The reply will be stored in context.inputs[key].</FieldDescription>
          </Field>
        ) : null}

        {/* Delay */}
        {node.type === "delay" ? (
          <Field>
            <FieldLabel>Delay (seconds)</FieldLabel>
            <Input type="number" value={String(config.delaySeconds ?? 60)} onChange={(e) => set("delaySeconds", Number(e.target.value))} min="1" max="604800" />
          </Field>
        ) : null}

        {/* AI Reply */}
        {node.type === "ai_reply" ? (
          <>
            <Field>
              <FieldLabel>System prompt</FieldLabel>
              <Textarea value={String(config.systemPrompt ?? "")} onChange={(e) => set("systemPrompt", e.target.value)} rows={3} />
            </Field>
            <Field>
              <FieldLabel>Model</FieldLabel>
              <NativeSelect value={String(config.model ?? "gpt-4o-mini")} onChange={(e) => set("model", e.target.value)}>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="claude-sonnet">Claude Sonnet</option>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>Max tokens</FieldLabel>
              <Input type="number" value={String(config.maxTokens ?? 500)} onChange={(e) => set("maxTokens", Number(e.target.value))} />
            </Field>
            <Field>
              <FieldLabel>Temperature</FieldLabel>
              <Input type="number" step="0.1" value={String(config.temperature ?? 0.7)} onChange={(e) => set("temperature", Number(e.target.value))} min="0" max="2" />
            </Field>
          </>
        ) : null}

        {/* Webhook */}
        {node.type === "webhook" ? (
          <>
            <Field>
              <FieldLabel>URL</FieldLabel>
              <Input value={String(config.url ?? "")} onChange={(e) => set("url", e.target.value)} placeholder="https://..." />
            </Field>
            <Field>
              <FieldLabel>Method</FieldLabel>
              <NativeSelect value={String(config.method ?? "POST")} onChange={(e) => set("method", e.target.value)}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
              </NativeSelect>
            </Field>
          </>
        ) : null}

        {/* Assign agent */}
        {node.type === "assign_agent" ? (
          <Field>
            <FieldLabel>Strategy</FieldLabel>
            <NativeSelect value={String(config.strategy ?? "round_robin")} onChange={(e) => set("strategy", e.target.value)}>
              <option value="specific">Specific user</option>
              <option value="round_robin">Round robin</option>
              <option value="least_busy">Least busy</option>
            </NativeSelect>
          </Field>
        ) : null}

        {/* Assign tag */}
        {node.type === "assign_tag" ? (
          <Field>
            <FieldLabel>Tag name</FieldLabel>
            <Input value={String(config.tagName ?? "")} onChange={(e) => set("tagName", e.target.value)} placeholder="VIP" />
          </Field>
        ) : null}

        {/* Create task */}
        {node.type === "create_task" ? (
          <>
            <Field>
              <FieldLabel>Task title</FieldLabel>
              <Input value={String(config.title ?? "")} onChange={(e) => set("title", e.target.value)} />
            </Field>
            <Field>
              <FieldLabel>Due in (hours)</FieldLabel>
              <Input type="number" value={String(config.dueInHours ?? 24)} onChange={(e) => set("dueInHours", Number(e.target.value))} />
            </Field>
          </>
        ) : null}

        {/* Human handoff */}
        {node.type === "human_handoff" ? (
          <>
            <Field>
              <FieldLabel>Handoff message</FieldLabel>
              <Textarea value={String(config.message ?? "")} onChange={(e) => set("message", e.target.value)} rows={2} placeholder="Connecting you to an agent…" />
            </Field>
            <Field>
              <FieldLabel>Strategy</FieldLabel>
              <NativeSelect value={String(config.strategy ?? "queue")} onChange={(e) => set("strategy", e.target.value)}>
                <option value="queue">Queue</option>
                <option value="round_robin">Round robin</option>
                <option value="specific">Specific agent</option>
              </NativeSelect>
            </Field>
          </>
        ) : null}

        {/* CRM Update */}
        {node.type === "crm_update" ? (
          <>
            <Field>
              <FieldLabel>Entity type</FieldLabel>
              <NativeSelect value={String(config.entityType ?? "lead")} onChange={(e) => set("entityType", e.target.value)}>
                <option value="lead">Lead</option>
                <option value="customer">Customer</option>
                <option value="deal">Deal</option>
                <option value="contact">Contact</option>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>Action</FieldLabel>
              <NativeSelect value={String(config.action ?? "update")} onChange={(e) => set("action", e.target.value)}>
                <option value="create">Create</option>
                <option value="update">Update</option>
                <option value="add_tag">Add tag</option>
                <option value="add_note">Add note</option>
              </NativeSelect>
            </Field>
          </>
        ) : null}

        {/* Node ID (read-only) */}
        <div className="border-t border-border/60 pt-3">
          <p className="text-[0.68rem] text-muted-foreground">Node ID: <code className="font-mono">{node.id}</code></p>
        </div>
      </div>

      {/* Delete button */}
      {node.type !== "start" ? (
        <div className="border-t border-border/60 p-3">
          <Button variant="ghost" size="sm" className="w-full text-destructive hover:bg-destructive/10" onClick={() => onDelete(node.id)}>
            <Trash2 className="mr-2 size-3.5" /> Delete node
          </Button>
        </div>
      ) : null}
    </aside>
  );
}
