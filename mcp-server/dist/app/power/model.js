function phaseCapacityWatts(phase) {
  if (typeof phase.ratedWatts === "number") return { watts: phase.ratedWatts, basis: "phase.ratedWatts" };
  if (typeof phase.voltage === "number" && typeof phase.ratedAmps === "number") {
    return {
      watts: phase.voltage * phase.ratedAmps,
      basis: "voltage multiplied by rated amps (VA). Power factor is not applied."
    };
  }
  return { watts: null, basis: "phase has neither ratedWatts nor voltage and ratedAmps" };
}

export { phaseCapacityWatts as p };
