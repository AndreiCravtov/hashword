{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts = {
      url = "github:hercules-ci/flake-parts";
      inputs.nixpkgs-lib.follows = "nixpkgs";
    };
    make-shell.url = "github:nicknovitski/make-shell";
  };
  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } (
      { ... }:
      {
        imports = [inputs.make-shell.flakeModules.default];
        systems = [
          "x86_64-linux"
          "aarch64-darwin"
        ];
        debug = true; # Enable options autocompletion
        perSystem =
          { pkgs, system, ... }:
          {
            # "Flake parts does not yet come with an endorsed module that initializes the pkgs argument."
            # So we must do this manually; https://flake.parts/overlays#consuming-an-overlay
            _module.args.pkgs = import inputs.nixpkgs {
              inherit system;
              config = {
                allowBroken = true;
                allowUnsupportedSystem = true;
                allowUnfree = true;
              };
              #overlays = [];
            };
            make-shells.default = {
              packages = with pkgs; [
                git
                nixd
                nixfmt

                # Add here
              ];
            };
          };
      }
    );
}
