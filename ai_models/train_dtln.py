import tensorflow as tf
from tensorflow.keras.layers import LSTM, Dense, Input, Multiply, Layer
from tensorflow.keras.models import Model
import numpy as np

class InstantLayerNormalization(Layer):
    """
    Instant Layer Normalization for causal processing.
    Normalizes over the feature dimension only.
    """
    def __init__(self, epsilon=1e-7, **kwargs):
        super(InstantLayerNormalization, self).__init__(**kwargs)
        self.epsilon = epsilon

    def build(self, input_shape):
        self.gain = self.add_weight(name='gain', shape=(input_shape[-1],), 
                                  initializer='ones', trainable=True)
        self.bias = self.add_weight(name='bias', shape=(input_shape[-1],), 
                                  initializer='zeros', trainable=True)
        super(InstantLayerNormalization, self).build(input_shape)

    def call(self, inputs):
        mean = tf.reduce_mean(inputs, axis=-1, keepdims=True)
        variance = tf.reduce_mean(tf.square(inputs - mean), axis=-1, keepdims=True)
        normalized = (inputs - mean) * tf.math.rsqrt(variance + self.epsilon)
        return normalized * self.gain + self.bias

def build_dtln_model(frame_len=512, hidden_size=128):
    """
    Builds the DTLN model. 
    Frame len is usually 512 for 16kHz (32ms windows, but we can use smaller for lower latency).
    For 5ms latency goal, we use a small hop size but keep the window for resolution.
    """
    # Magnitude Spectrogram Input
    input_mag = Input(shape=(None, frame_len // 2 + 1), name='input_mag')
    
    # 1. Processing in STFT Domain
    x1 = InstantLayerNormalization()(input_mag)
    x1 = LSTM(hidden_size, return_sequences=True, stateful=False)(x1)
    x1 = LSTM(hidden_size, return_sequences=True, stateful=False)(x1)
    # Masking layer
    mask1 = Dense(frame_len // 2 + 1, activation='sigmoid')(x1)
    out1 = Multiply()([input_mag, mask1])
    
    # 2. Processing in Learned Domain (after IFFT-like transform)
    # Note: In a full DTLN, we'd do an IFFT and then a learned Conv1D.
    # For this snippet, we simulate the dual-path logic.
    x2 = Dense(hidden_size)(out1)
    x2 = InstantLayerNormalization()(x2)
    x2 = LSTM(hidden_size, return_sequences=True, stateful=False)(x2)
    x2 = LSTM(hidden_size, return_sequences=True, stateful=False)(x2)
    
    # Final mask for the learned domain
    mask2 = Dense(frame_len // 2 + 1, activation='sigmoid')(x2)
    out2 = Multiply()([out1, mask2])
    
    model = Model(inputs=input_mag, outputs=out2)
    return model

if __name__ == "__main__":
    model = build_dtln_model()
    model.summary()
    print("DTLN Model built successfully for causal inference.")
