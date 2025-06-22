import { Barretenberg, RawBuffer, UltraHonkBackend } from "@aztec/bb.js";
import innerCircuit from "../circuits/merkleProof/target/merkleproof.json" assert { type: "json" };
import recursiveCircuit from "../circuits/gamePlayProver/target/gamePlayProver.json" assert { type: "json" };
import { CompiledCircuit, Noir } from "@noir-lang/noir_js";
import express from "express";

const app = express();
const port = 9000;
app.use(express.json({ limit: '20mb' }));

const proveit = async (p: any) => {
  try {
    const innerCircuitNoir = new Noir(innerCircuit as CompiledCircuit);
    const innerBackend = new UltraHonkBackend(innerCircuit.bytecode, { threads: 1 }, { recursive: true });

    // Generate proof for inner circuit
    const inputs = { paths: p, bad_hashes: ["0x2a95107b4ec167027df90348038cb6b9c0797fb5c8c71f8f1b01e670c7bc7d16"], cheating: [0, 0] };
    const { witness } = await innerCircuitNoir.execute(inputs);
    const { proof: innerProofFields, publicInputs: innerPublicInputs } = await innerBackend.generateProofForRecursiveAggregation(witness);

    // Get verification key for inner circuit as fields
    const innerCircuitVerificationKey = await innerBackend.getVerificationKey();
    const barretenbergAPI = await Barretenberg.new({ threads: 1 });
    const vkAsFields = (await barretenbergAPI.acirVkAsFieldsUltraHonk(new RawBuffer(innerCircuitVerificationKey))).map(field => field.toString());

    // Generate proof of the recursive circuit
    const recursiveCircuitNoir = new Noir(recursiveCircuit as CompiledCircuit);
    const recursiveBackend = new UltraHonkBackend(recursiveCircuit.bytecode, { threads: 16 });
    // console.log(innerPublicInputs);
    const recursiveInputs = { proof: innerProofFields, public_inputs: innerPublicInputs, verification_key: vkAsFields };
    const { witness: recursiveWitness } = await recursiveCircuitNoir.execute(recursiveInputs);
    const { proof: recursiveProof, publicInputs: recursivePublicInputs } = await recursiveBackend.generateProof(recursiveWitness);
    // Verify recursive proof
    const verified = await recursiveBackend.verifyProof({ proof: recursiveProof, publicInputs: recursivePublicInputs });
    console.log("Recursive proof verified: ", verified);

    process.exit(verified ? 0 : 1);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};



app.post("/", (req: any, res: any) => {
  proveit(req.body["p"]);
  res.status(200).send('Data received successfully');

});


app.listen(port, () => {
  console.log(`Listening on port ${port}...`);
});