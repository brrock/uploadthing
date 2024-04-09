import type { FetchEsque, MaybePromise } from "@uploadthing/shared";
import { safeParseJSON, UploadThingError } from "@uploadthing/shared";

import { UPLOADTHING_VERSION } from "./constants";
import { maybeParseResponseXML } from "./s3-error-parser";
import type { ActionType, UTEvents } from "./types";

const createAPIRequestUrl = (config: {
  /**
   * URL to the UploadThing API endpoint
   * @example URL { /api/uploadthing }
   * @example URL { https://www.example.com/api/uploadthing }
   */
  url: URL;
  slug: string;
  actionType: ActionType;
}) => {
  const url = new URL(config.url);

  const queryParams = new URLSearchParams(url.search);
  queryParams.set("actionType", config.actionType);
  queryParams.set("slug", config.slug);

  url.search = queryParams.toString();
  return url;
};

export type UTReporter = <TEvent extends keyof UTEvents>(
  type: TEvent,
  payload: UTEvents[TEvent]["in"],
  headers?: HeadersInit,
) => Promise<UTEvents[TEvent]["out"]>;

/**
 * Creates a "client" for reporting events to the UploadThing server via the user's API endpoint.
 * Events are handled in "./handler.ts starting at L200"
 */
export const createUTReporter = (cfg: {
  url: URL;
  endpoint: string;
  package: string;
  fetch: FetchEsque;
  headers: HeadersInit | (() => MaybePromise<HeadersInit>) | undefined;
}): UTReporter => {
  return async (type, payload) => {
    const url = createAPIRequestUrl({
      url: cfg.url,
      slug: cfg.endpoint,
      actionType: type,
    });
    let customHeaders =
      typeof cfg.headers === "function" ? cfg.headers() : cfg.headers;
    if (customHeaders instanceof Promise) customHeaders = await customHeaders;

    const response = await cfg.fetch(url, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
        "x-uploadthing-package": cfg.package,
        "x-uploadthing-version": UPLOADTHING_VERSION,
        ...customHeaders,
      },
    });

    switch (type) {
      case "failure": {
        // why isn't this narrowed automatically?
        const p = payload as UTEvents["failure"]["in"];
        const parsed = maybeParseResponseXML(p.s3Error ?? "");
        if (parsed?.message) {
          throw new UploadThingError({
            code: parsed.code,
            message: parsed.message,
          });
        } else {
          throw new UploadThingError({
            code: "UPLOAD_FAILED",
            message: `Failed to upload file ${p.fileName} to S3`,
            cause: p.s3Error,
          });
        }
      }
    }

    if (!response.ok) {
      const error = await UploadThingError.fromResponse(response);
      throw error;
    }

    const jsonOrError =
      await safeParseJSON<UTEvents[typeof type]["out"]>(response);
    if (jsonOrError instanceof Error) {
      throw new UploadThingError({
        code: "BAD_REQUEST",
        message: jsonOrError.message,
        cause: response,
      });
    }

    return jsonOrError;
  };
};
