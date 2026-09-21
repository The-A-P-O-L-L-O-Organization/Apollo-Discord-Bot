fn main() -> Result<(), Box<dyn std::error::Error>> {
    let proto_root = "../../protos";
    let out_dir = std::env::var("OUT_DIR")?;
    
    // Generate prost code
    prost_build::Config::new()
        .out_dir(&out_dir)
        .compile_protos(&["nsfw/v1/nsfw.proto"], &[proto_root])?;
    
    // Generate tonic code
    tonic_build::configure()
        .out_dir(&out_dir)
        .compile(&["nsfw/v1/nsfw.proto"], &[proto_root])?;
    
    println!("cargo:rerun-if-changed=../../protos/nsfw/v1/nsfw.proto");
    Ok(())
}