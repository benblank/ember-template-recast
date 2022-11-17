import * as fs from 'fs';
import * as path from 'path';
import { register as registerTsNode } from 'ts-node';
import workerpool from 'workerpool';
import { transform } from './index';
import type { TransformPluginBuilder } from './index';

interface TransformResult {
  changed: boolean;
  skipped: boolean;
  source: string;
}

interface TransformOptions {
  dry: boolean;
}

async function run(transformPath: string, filePath: string, options: TransformOptions) {
  if (/\.tsx?$/.test(transformPath)) {
    registerTsNode({ projectSearchDir: path.dirname(transformPath), transpileOnly: true });
  }

  const module = require(transformPath);
  const plugin: TransformPluginBuilder =
    typeof module.default === 'function' ? module.default : module;

  return readFile(filePath)
    .then((contents) => applyTransform(plugin, filePath, contents))
    .then((output) => writeFile(filePath, output, options))
    .then((output) => ({
      type: 'update',
      file: filePath,
      status: output.skipped ? 'skipped' : output.changed ? 'ok' : 'nochange',
    }))
    .catch((err) => ({
      type: 'error',
      file: filePath,
      error: err.stack,
    }));
}

/**
 * @param {string} filePath
 * @returns {Promise<string>}
 */
function readFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, contents) => {
      err ? reject(err) : resolve(contents);
    });
  });
}

function applyTransform(
  plugin: TransformPluginBuilder,
  filePath: string,
  contents: string
): TransformResult {
  const results = transform({
    template: contents,
    filePath,
    plugin,
  });

  return {
    skipped: !results.code,
    changed: results.code !== contents,
    source: results.code,
  };
}

async function writeFile(
  filePath: string,
  output: TransformResult,
  options: TransformOptions
): Promise<TransformResult> {
  const { changed, source } = output;

  if (options.dry || !changed) {
    return output;
  }

  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, source, 'utf8', (err) => {
      err ? reject(err) : resolve(output);
    });
  });
}

workerpool.worker({
  run,
});
