# Replacement production vehicle asset contract

The bundled Qvist_designs model is a licensed independent 2026 concept (CC BY 4.0),
not a measured team vehicle. The original helper GLB supplies rims/brakes. A photoreal
production replacement must pass this contract; a box-model substitute does not.

- Author in Blender in metres, apply transforms. +Z forward, +Y up at export;
  origin on ground between axles. Verify glTF axis conversion with the 1m test cube.
- Freeze actual event/chassis year, regulation version, independent dimensions and
  the photographs used to derive forms. Width target <=1.900m, axle separation
  <=3.400m for 2026 F1; actual overall length and aero surfaces need team references.
- Provide distinct nose, front wing mainplane/flaps/endplates, floor edges/diffuser,
  sidepods/intakes/undercuts, engine cover, roll hoop, open cockpit, Halo, mirrors,
  suspension wishbones/pushrods, brakes/calipers, rims/tires, steering wheel/driver.
- Use subdivision/baked normal workflow for visible silhouette and crease fidelity.
  No faceted cockpit or cylinders substituted for bodywork in production LOD0.
- LOD0 <=120k triangles, LOD1 <=35k, LOD2 <=5k; 8/4/2 main material draws as targets.
  Keep silhouette, axes, sockets and contact locations consistent between levels.
- Name nodes wheel_fl/fr/rl/rr, steer_fl/fr, aero_front/rear, rain_light,
  camera_onboard, contact_fl/fr/rl/rr. Front and rear aero rotate independently.
- Texture sets: baseColor(sRGB), normal(Non-Color/OpenGL), roughness/metalness/AO
  (Non-Color), optional paint clearcoat. UDIM is not a web delivery requirement.
  2K atlas for body/livery, 1K tire/rim set initially; KTX2 plus mipmaps for release.
- Provide genuine category tire dimensions, tread variants and sidewall materials.
  Avoid branded markings unless separately cleared. No civilian brake lights.
- Include correct onboard cockpit/Halo/helmet/arm clearance and mirror visibility.
- Export GLB with Meshopt and validate after compression. Quantization transforms
  must preserve metre dimensions; compare compressed and source bounds/normals.
- Deliver .blend, uncompressed export, compressed LOD GLBs, textures, previews at
  four angles, node/socket manifest, triangle/draw/texture-byte report, licenses,
  permission records and attribution. Web embedding must permit distributing
  retrievable assets. Model license does not automatically license team trademarks.
- Teams receive their own authentic approved livery and relevant geometry variants.
  A shared body with palette changes must remain labelled category reconstruction.

No Blender installation or licensed team CAD was present in the current execution
environment. The repeatable Qvist preparation script and original helper exporter
allow immediate simulation integration while accurate team assets are made. The
current distant LOD is about 7.5k triangles, exceeding the 5k production target.
