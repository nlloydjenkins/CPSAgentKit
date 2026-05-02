import { describe, it, expect } from "vitest";
import { safePath } from "../../fs/fileUtils.js";

describe("safePath", () => {
  it("resolves a valid relative path", () => {
    const result = safePath("/base/dir", "child/file.txt");
    expect(result).toBe("/base/dir/child/file.txt");
  });

  it("resolves current directory reference", () => {
    const result = safePath("/base/dir", "./file.txt");
    expect(result).toBe("/base/dir/file.txt");
  });

  it("allows nested subdirectories", () => {
    const result = safePath("/base", "a/b/c/d.txt");
    expect(result).toBe("/base/a/b/c/d.txt");
  });

  it("blocks simple parent traversal", () => {
    expect(() => safePath("/base/dir", "../escape.txt")).toThrow(
      "Path traversal blocked",
    );
  });

  it("blocks deep parent traversal", () => {
    expect(() => safePath("/base/dir", "../../etc/passwd")).toThrow(
      "Path traversal blocked",
    );
  });

  it("blocks traversal hidden by intermediate directories", () => {
    expect(() => safePath("/base/dir", "child/../../escape")).toThrow(
      "Path traversal blocked",
    );
  });

  it("blocks absolute path outside base", () => {
    expect(() => safePath("/base/dir", "/etc/passwd")).toThrow(
      "Path traversal blocked",
    );
  });

  it("allows the base directory itself", () => {
    // path.resolve("/base/dir", ".") === "/base/dir"
    const result = safePath("/base/dir", ".");
    expect(result).toBe("/base/dir");
  });

  it("blocks path that is a prefix but not a child", () => {
    // "/base/dir-sibling" starts with "/base/dir" but is not under it
    expect(() => safePath("/base/dir", "../dir-sibling/file")).toThrow(
      "Path traversal blocked",
    );
  });
});
