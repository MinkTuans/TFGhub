"use client";

import { studioComponentDefaults } from "./studio-component-defaults";
import { studioLabel, studioFieldLabel } from "./studio-labels";
import { useId, useState } from "react";
import {
  v2ComponentRegistry,
  type EngineProjectV2Type,
} from "@indieforge/contracts";
import { useStudio } from "./studio-provider";
import { prepareStudioCommit } from "./studio-history";
import {
  removeComponentCommand,
  updateComponentCommand,
} from "./object-commands";

type Component =
  EngineProjectV2Type["scenes"][number]["objects"][number]["components"][number];
type Schema = typeof v2ComponentRegistry.Transform.schema;
function unwrap(schema: Schema): Schema {
  if (schema._def.typeName === "ZodEffects") return unwrap(schema._def.schema);
  if (schema._def.typeName === "ZodDefault")
    return unwrap(schema._def.innerType);
  return schema;
}
export function studioValidationMessage(error: unknown) {
  const message = (text: string) => {
    if (text === "Current health cannot exceed maximum health")
      return "Sức khỏe hiện tại không được vượt quá mức tối đa.";
    if (text === "Collider must reference a COLLISION layer")
      return "Vùng va chạm phải tham chiếu một lớp va chạm.";
    if (text === "Scale must not be zero")
      return "Tỉ lệ không được bằng 0.";
    if (/referenc/i.test(text))
      return "Tham chiếu không hợp lệ. Kiểm tra các đối tượng, lớp, tài nguyên và sự kiện liên quan.";
    if (/[À-ỹ]/u.test(text)) return text;
    return "Giá trị không hợp lệ. Kiểm tra kiểu dữ liệu, giới hạn và các tham chiếu.";
  };
  if (
    error &&
    typeof error === "object" &&
    "issues" in error &&
    Array.isArray(error.issues)
  )
    return error.issues
      .map(
        (issue: { path: (string | number)[]; message: string }) =>
          `${studioFieldLabel(issue.path.join("."))}: ${message(issue.message)}`,
      )
      .join(" · ");
  return error instanceof Error
    ? message(error.message)
    : "Không thể áp dụng thay đổi.";
}

function JsonField({
  label,
  value,
  change,
}: {
  label: string;
  value: unknown;
  change: (value: unknown) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  return (
    <label>
      {studioFieldLabel(label)}
      <textarea
        aria-label={studioFieldLabel(label)}
        value={text}
        spellCheck={false}
        onChange={(event) => {
          setText(event.target.value);
          try {
            change(JSON.parse(event.target.value));
          } catch {
            change(undefined);
          }
        }}
      />
    </label>
  );
}
/** Field shape, enums, optionality and validation all come from the registry.
 * Arrays/opaque JSON have an explicit JSON editor; no component-specific rules
 * or copies of canonical schemas live in the presentation layer. */
function Fields({
  schema: wrapped,
  value,
  label = "",
  change,
}: {
  schema: Schema;
  value: unknown;
  label?: string;
  change: (value: unknown) => void;
}) {
  const schema = unwrap(wrapped),
    kind = schema._def.typeName;
  if (kind === "ZodNullable") {
    const inner = unwrap(schema._def.innerType);
    if (!["ZodString", "ZodNumber", "ZodEnum"].includes(inner._def.typeName))
      return <JsonField label={label} value={value} change={change} />;
    return (
      <Fields
        schema={inner}
        value={value ?? ""}
        label={label}
        change={(next) => change(next === "" ? null : next)}
      />
    );
  }
  if (kind === "ZodDiscriminatedUnion") {
    const discriminator = schema._def.discriminator as string;
    const options = schema._def.options as Schema[];
    const current = (value ?? {}) as Record<string, unknown>;
    const selected =
      options.find(
        (option) =>
          option._def.shape()[discriminator]._def.value ===
          current[discriminator],
      ) ?? options[0];
    return (
      <>
        <label>
          {studioLabel(discriminator)}
          <select
            aria-label={studioLabel(discriminator)}
            value={String(current[discriminator])}
            onChange={(event) => {
              const option = options.find(
                (option) =>
                  option._def.shape()[discriminator]._def.value ===
                  event.target.value,
              )!;
              const next: Record<string, unknown> = {};
              for (const key of Object.keys(option._def.shape()))
                next[key] =
                  key === discriminator
                    ? event.target.value
                    : key in current
                      ? current[key]
                      : "";
              change(next);
            }}
          >
            {options.map((option) => {
              const value = option._def.shape()[discriminator]._def
                .value as string;
              return <option key={value} value={value}>{studioLabel(value)}</option>;
            })}
          </select>
        </label>
        <Fields
          schema={selected}
          value={current}
          label={label}
          change={change}
        />
      </>
    );
  }
  if (kind === "ZodObject") {
    const shape = schema._def.shape() as Record<string, Schema>;
    const current = (value ?? {}) as Record<string, unknown>;
    return (
      <>
        {Object.entries(shape)
          .filter(([, schema]) => unwrap(schema)._def.typeName !== "ZodLiteral")
          .map(([key, schema]) => (
            <Fields
              key={key}
              schema={schema}
              value={current[key]}
              label={label ? `${label}.${key}` : key}
              change={(next) => change({ ...current, [key]: next })}
            />
          ))}
      </>
    );
  }
  if (kind === "ZodBoolean")
    return (
      <label>
        <input
          aria-label={studioFieldLabel(label)}
          type="checkbox"
          checked={value === true}
          onChange={(event) => change(event.target.checked)}
        />
        {studioFieldLabel(label)}
      </label>
    );
  if (kind === "ZodEnum")
    return (
      <label>
        {studioFieldLabel(label)}
        <select
          aria-label={studioFieldLabel(label)}
          value={String(value)}
          onChange={(event) => change(event.target.value)}
        >
          {(schema._def.values as string[]).map((value) => (
            <option key={value} value={value}>{studioLabel(value)}</option>
          ))}
        </select>
      </label>
    );
  if (kind === "ZodNumber")
    return (
      <label>
        {studioFieldLabel(label)}
        <input
          aria-label={studioFieldLabel(label)}
          type="number"
          step="any"
          value={
            typeof value === "number" && Number.isFinite(value) ? value : ""
          }
          onChange={(event) =>
            change(
              event.target.value === ""
                ? undefined
                : Number(event.target.value),
            )
          }
        />
      </label>
    );
  if (kind === "ZodString")
    return (
      <label>
        {studioFieldLabel(label)}
        <textarea
          aria-label={studioFieldLabel(label)}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => change(event.target.value)}
        />
      </label>
    );
  return <JsonField label={label} value={value} change={change} />;
}

export function ComponentEditor({
  sceneId,
  objectId,
  component,
}: {
  sceneId: string;
  objectId: string;
  component: Component;
}) {
  return (
    <ComponentForm
      key={component.id}
      sceneId={sceneId}
      objectId={objectId}
      component={component}
    />
  );
}
function ComponentForm({
  sceneId,
  objectId,
  component,
}: {
  sceneId: string;
  objectId: string;
  component: Component;
}) {
  const { state, dispatch } = useStudio();
  const definition = v2ComponentRegistry[component.type];
  const [draft, setDraft] = useState<unknown>(() =>
    structuredClone(component.properties),
  );
  const [error, setError] = useState("");
  const [reset, setReset] = useState(0);
  const serialized = JSON.stringify(component.properties);
  const [baseline, setBaseline] = useState(serialized);
  if (baseline !== serialized) {
    setBaseline(serialized);
    setDraft(structuredClone(component.properties));
    setError("");
    setReset(reset + 1);
  }
  const errorId = useId();
  const editable =
    state.ready &&
    !state.recoveryError &&
    !state.resolution &&
    !state.batchError;
  function commit(remove = false) {
    if (!editable) return;
    try {
      const mutation = remove
        ? removeComponentCommand(sceneId, objectId, component.id)
        : updateComponentCommand(
            sceneId,
            objectId,
            component.id,
            definition.schema.parse(draft),
          );
      prepareStudioCommit(state, [mutation]);
      dispatch({ type: "commit", mutations: [mutation] });
      setError("");
    } catch (error) {
      setError(studioValidationMessage(error));
    }
  }
  return (
    <fieldset
      className="studio-component"
      aria-label={studioLabel(component.type)}
      disabled={!editable}
    >
      <legend>{studioLabel(component.type)}</legend>
      <small>Phiên bản {component.version}</small>
      <form
        noValidate
        aria-describedby={error ? errorId : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          commit();
        }}
      >
        <Fields
          key={reset}
          schema={definition.schema}
          value={draft}
          change={setDraft}
        />
        {error && (
          <p role="alert" id={errorId}>
            {error}
          </p>
        )}
        <div className="studio-actions">
          <button type="submit">Lưu {studioLabel(component.type)}</button>
          <button
            type="button"
            onClick={() => {
              setDraft(studioComponentDefaults(component.type));
              setReset((value) => value + 1);
              setError("");
            }}
          >
            Mặc định {studioLabel(component.type)}
          </button>
          {component.type !== "Transform" && (
            <button type="button" onClick={() => commit(true)}>
              Gỡ {studioLabel(component.type)}
            </button>
          )}
        </div>
      </form>
    </fieldset>
  );
}
