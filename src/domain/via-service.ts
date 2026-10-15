// The key to each object's change methods for its {viaService} properties (domain model
// section 1). An object keeps them under this key, so code reaches them only by importing
// it, and only files in src/domain/ may (via-service.test.ts checks this). There, the
// objects define the methods and the services call them.
export const VIA_SERVICE = Symbol("viaService");
