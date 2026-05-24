'use strict';

/**
 * Default dynamic options.
 */
const defaultOptions = {
  os: '',
  arch: '',
  compiler: '',
  variant: '',
  localWarehouse: '',
  remoteWarehouse: '',
  packageNamespace: '',
  packageDefaultVersion: '',
  staticPackages: [],
  preloadPackages: [],
};

/**
 * Create a new Options object from defaults + applied option functions.
 *
 * @param {...Function} opts - option functions (opt) => void
 * @returns {object}
 */
function newOptions(...opts) {
  const options = JSON.parse(JSON.stringify(defaultOptions));
  for (const opt of opts) {
    if (opt) opt(options);
  }
  return options;
}

// -------------- Dynamic Option functions ----------------

function withOs(os) {
  return (o) => { o.os = os; };
}

function withArch(arch) {
  return (o) => { o.arch = arch; };
}

function withCompiler(compiler) {
  return (o) => { o.compiler = compiler; };
}

function withVariant(variant) {
  return (o) => { o.variant = variant; };
}

function withLocalWarehouse(localWarehouse) {
  return (o) => { o.localWarehouse = localWarehouse; };
}

function withRemoteWarehouse(remoteWarehouse) {
  return (o) => { o.remoteWarehouse = remoteWarehouse; };
}

function withPackageNamespace(packageNamespace) {
  return (o) => { o.packageNamespace = packageNamespace; };
}

function withPackageDefaultVersion(packageDefaultVersion) {
  return (o) => { o.packageDefaultVersion = packageDefaultVersion; };
}

function withStaticPackage(pkg) {
  return (o) => { o.staticPackages.push(pkg); };
}

function withPreloadPackage(pkg) {
  return (o) => { o.preloadPackages.push(pkg); };
}

module.exports = {
  defaultOptions,
  newOptions,
  withOs,
  withArch,
  withCompiler,
  withVariant,
  withLocalWarehouse,
  withRemoteWarehouse,
  withPackageNamespace,
  withPackageDefaultVersion,
  withStaticPackage,
  withPreloadPackage,
};
