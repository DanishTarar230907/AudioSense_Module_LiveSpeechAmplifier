import tensorflow as tf
import numpy as np

def export_dtln_tflite(model_path, export_path):
    """
    Exports a saved Keras DTLN model to TFLite with INT8 quantization.
    Requires a representative dataset for calibration.
    """
    model = tf.keras.models.load_model(model_path)
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    
    # Enable Quantization
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    
    # Representative dataset for INT8 calibration
    def representative_dataset_gen():
        for _ in range(100):
            # Use random noise or samples from DNS challenge
            data = np.random.rand(1, 100, 257).astype(np.float32)
            yield [data]
            
    converter.representative_dataset = representative_dataset_gen
    converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
    converter.inference_input_type = tf.int8
    converter.inference_output_type = tf.int8
    
    tflite_model = converter.convert()
    
    with open(export_path, 'wb') as f:
        f.write(tflite_model)
    print(f"DTLN INT8 Model saved to {export_path}")

def export_convtasnet_tflite(torch_model, export_path):
    """
    Note: PyTorch to TFLite typically follows: PyTorch -> ONNX -> TFLite.
    This snippet outlines the TFLite conversion parameters for INT8.
    """
    # Assuming the model is already converted to a saved_model format via onnx2tf
    # or similar tool which is standard for edge deployment.
    # converter = tf.lite.TFLiteConverter.from_saved_model('saved_model_convtasnet')
    # ... (same quantization steps as above)
    print("Conv-TasNet export requires ONNX intermediary. Ensure 'onnx2tf' is used.")

if __name__ == "__main__":
    # In a real scenario, you'd point to actual saved models
    # export_dtln_tflite('dtln_model.h5', 'dtln_quant.tflite')
    print("Export script ready. Run with actual model paths.")
